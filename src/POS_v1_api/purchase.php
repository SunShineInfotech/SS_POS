<?php
// v1_api/purchase.php
require_once 'dbconnection.php';

if (isset($GLOBALS['_RAW_INPUT'])) {
    $postData = json_decode($GLOBALS['_RAW_INPUT'], true);
} else {
    $postData = json_decode(file_get_contents('php://input'), true);
}

logRequest('purchase', $postData);

if (empty($postData)) {
    http_response_code(400);
    $response = ['status' => 'error', 'message' => 'No data received'];
    logResponse('purchase', $response);
    echo json_encode($response);
    exit;
}

$type = isset($postData['type']) ? intval($postData['type']) : 0;

// ----- Scope -----
$company_id   = isset($postData['company_id']) ? mysqli_real_escape_string($sql, trim($postData['company_id'])) : '';
$franchise_id = isset($postData['franchise_id']) ? mysqli_real_escape_string($sql, trim($postData['franchise_id'])) : '';

// ----- Header fields -----
$purchase_id       = isset($postData['purchase_id']) ? intval($postData['purchase_id']) : 0;
$financial_year_id = isset($postData['financial_year_id']) ? intval($postData['financial_year_id']) : 0;
$employee_id       = isset($postData['employee_id']) ? intval($postData['employee_id']) : 0;
$bill_number       = isset($postData['bill_number']) ? mysqli_real_escape_string($sql, trim($postData['bill_number'])) : '';
$purchase_date     = isset($postData['purchase_date']) ? trim($postData['purchase_date']) : '';
$vendor_id         = isset($postData['vendor_id']) ? intval($postData['vendor_id']) : 0;
$remark            = isset($postData['remark']) ? mysqli_real_escape_string($sql, trim($postData['remark'])) : '';
$discount_type     = (isset($postData['discount_type']) && $postData['discount_type'] === 'percent') ? 'percent' : 'amount';
$discount_value    = isset($postData['discount_value']) ? floatval($postData['discount_value']) : 0;
$items             = (isset($postData['items']) && is_array($postData['items'])) ? $postData['items'] : [];

// ----- List filters (type 2, optional) -----
$from_date = isset($postData['from_date']) ? trim($postData['from_date']) : '';
$to_date   = isset($postData['to_date']) ? trim($postData['to_date']) : '';

$response = ['status' => 'error', 'message' => 'Invalid request'];
http_response_code(400);

// tbl_transaction.transaction_type (party ledger view)
const TXN_CREDIT = '1'; // vendor outstanding goes up   -> purchase
const TXN_DEBIT  = '2'; // vendor outstanding goes down -> payment, purchase return

// =====================================================================
// Helpers
// =====================================================================

// Runs a query and throws on failure (works with or without mysqli exception mode)
function runQuery($sql, $query) {
    $result = mysqli_query($sql, $query);
    if ($result === false) {
        throw new Exception(mysqli_error($sql));
    }
    return $result;
}

function isValidDate($date) {
    $d = DateTime::createFromFormat('Y-m-d', $date);
    return $d && $d->format('Y-m-d') === $date;
}

// Validates line items and calculates line totals on the server.
// Returns ['lines' => [...]] or ['error' => '...']
function buildLines($items) {
    if (empty($items)) {
        return ['error' => 'Add at least one product'];
    }

    $lines = [];
    $seen  = [];

    foreach (array_values($items) as $i => $item) {
        $row        = $i + 1;
        $product_id = isset($item['product_id']) ? intval($item['product_id']) : 0;
        $qty        = isset($item['qty']) ? floatval($item['qty']) : 0;
        $price      = isset($item['price']) ? floatval($item['price']) : 0;
        $gst        = isset($item['gst_percent']) ? floatval($item['gst_percent']) : 0;

        if ($product_id <= 0)       return ['error' => "Item $row: select a product"];
        if ($qty <= 0)              return ['error' => "Item $row: quantity must be greater than 0"];
        if ($price <= 0)            return ['error' => "Item $row: base price must be greater than 0"];
        if ($gst < 0 || $gst > 100) return ['error' => "Item $row: GST % must be between 0 and 100"];
        if (isset($seen[$product_id])) return ['error' => "Item $row: this product is already added"];
        $seen[$product_id] = true;

        $sub        = round($qty * $price, 2);
        $gst_amount = round($sub * $gst / 100, 2);

        $lines[] = [
            'product_id'  => $product_id,
            'qty'         => $qty,
            'price'       => $price,
            'gst_percent' => $gst,
            'gst_amount'  => $gst_amount,
            'sub'         => $sub,
            'total'       => round($sub + $gst_amount, 2),
        ];
    }

    return ['lines' => $lines];
}

// Calculates bill totals. Discount is applied on the items total (incl. GST).
function calcTotals($lines, $discount_type, $discount_value) {
    $sub = 0;
    $gst = 0;
    foreach ($lines as $l) {
        $sub += $l['sub'];
        $gst += $l['gst_amount'];
    }
    $items_total = round($sub + $gst, 2);

    if ($discount_value < 0) {
        return ['error' => 'Discount cannot be negative'];
    }
    if ($discount_type === 'percent') {
        if ($discount_value > 100) {
            return ['error' => 'Discount % cannot be more than 100'];
        }
        $discount = round($items_total * $discount_value / 100, 2);
    } else {
        if ($discount_value > $items_total + 0.01) {
            return ['error' => 'Discount cannot be more than the items total'];
        }
        $discount = round(min($discount_value, $items_total), 2);
    }

    return [
        'subtotal'    => round($sub, 2),
        'gst'         => round($gst, 2),
        'items_total' => $items_total,
        'discount'    => $discount,
        'grand_total' => round($items_total - $discount, 2),
    ];
}

// Returns null when valid, or [http_code, message]
function validatePurchase($sql, $company_id, $franchise_id, $vendor_id, $bill_number, $purchase_date, $lines, $exclude_id = 0) {
    if ($company_id === '')   return [400, 'Company ID is required'];
    if ($franchise_id === '') return [400, 'Franchise ID is required'];
    if ($bill_number === '')  return [400, 'Bill number is required'];
    if (!isValidDate($purchase_date)) return [400, 'Enter a valid purchase date'];
    if ($vendor_id <= 0)      return [400, 'Select a vendor'];

    // Vendor must exist
    $r = runQuery($sql, "SELECT vendor_id FROM tbl_vendor
                         WHERE vendor_id = '$vendor_id'
                           AND company_id = '$company_id'
                           AND is_deleted = '1'");
    if (mysqli_num_rows($r) === 0) {
        return [404, 'Selected vendor was not found'];
    }

    // All products must exist in this company/franchise
    $ids = implode(',', array_map('intval', array_column($lines, 'product_id')));
    $r = runQuery($sql, "SELECT COUNT(*) AS cnt FROM tbl_product
                         WHERE product_id IN ($ids)
                           AND company_id = '$company_id'
                           AND franchise_id = '$franchise_id'
                           AND is_deleted = '1'");
    if (intval(mysqli_fetch_assoc($r)['cnt']) !== count($lines)) {
        return [404, 'One or more products were not found. Reload the page and try again.'];
    }

    // Same bill number for the same vendor is not allowed
    $exclude = $exclude_id > 0 ? "AND purchess_id != '$exclude_id'" : '';
    $r = runQuery($sql, "SELECT purchess_id FROM tbl_purchess
                         WHERE company_id = '$company_id'
                           AND franchise_id = '$franchise_id'
                           AND purchess_vendor_id = '$vendor_id'
                           AND purchess_bill_number = '$bill_number'
                           AND is_deleted = '1'
                           $exclude");
    if (mysqli_num_rows($r) > 0) {
        return [409, 'This bill number is already entered for this vendor'];
    }

    return null;
}

// Fetches an active purchase header, or null
function getPurchaseHeader($sql, $purchase_id, $company_id, $franchise_id) {
    $r = runQuery($sql, "SELECT purchess_id, purchess_return_yes_no, purchess_vendor_id,
                                purches_total_with_gst_amount, purchess_financial_year_id
                         FROM tbl_purchess
                         WHERE purchess_id = '$purchase_id'
                           AND company_id = '$company_id'
                           AND franchise_id = '$franchise_id'
                           AND is_deleted = '1'");
    return mysqli_num_rows($r) > 0 ? mysqli_fetch_assoc($r) : null;
}

// Total paid against a bill from the Purchase Payment screen.
// Payment rows = debit + paid from an account + not a purchase return.
function getBillPaid($sql, $company_id, $purchase_id) {
    $r = runQuery($sql, "SELECT COALESCE(SUM(transaction_amount), 0) AS paid
                         FROM tbl_transaction
                         WHERE transaction_purches_id = '" . intval($purchase_id) . "'
                           AND company_id = '$company_id'
                           AND transaction_type = '" . TXN_DEBIT . "'
                           AND transaction_account_id > 0
                           AND COALESCE(transaction_purches_return_id, 0) = 0
                           AND is_deleted = '1'");
    return round(floatval(mysqli_fetch_assoc($r)['paid']), 2);
}

// Inserts detail rows and adds the purchased qty to product stock
function insertLines($sql, $company_id, $franchise_id, $purchase_id, $lines) {
    foreach ($lines as $l) {
        $pid = intval($l['product_id']);
        $qty = floatval($l['qty']);

        runQuery($sql, "UPDATE tbl_product
                        SET product_stock = product_stock + $qty
                        WHERE product_id = '$pid'
                          AND company_id = '$company_id'
                          AND franchise_id = '$franchise_id'");

        $r = runQuery($sql, "SELECT product_stock FROM tbl_product WHERE product_id = '$pid'");
        $available_stock = floatval(mysqli_fetch_assoc($r)['product_stock']);

        runQuery($sql, "INSERT INTO tbl_purchess_details (
                            company_id, purchess_details_purches_id, purchess_details_product_id,
                            purchess_details_single_product_price, purchess_details_product_gst_price,
                            purchess_details_product_gst_persantage, purchess_details_product_qty,
                            purchess_details_total_price, purchess_details_product_avalable_stock,
                            is_deleted, c_date
                        ) VALUES (
                            '$company_id', '$purchase_id', '$pid',
                            '{$l['price']}', '{$l['gst_amount']}',
                            '{$l['gst_percent']}', '$qty',
                            '{$l['total']}', '$available_stock',
                            '1', NOW()
                        )");
    }
}

// Removes the stock added by a purchase and soft-deletes its detail rows
function reverseLines($sql, $company_id, $franchise_id, $purchase_id) {
    $r = runQuery($sql, "SELECT purchess_details_product_id, purchess_details_product_qty
                         FROM tbl_purchess_details
                         WHERE purchess_details_purches_id = '$purchase_id'
                           AND company_id = '$company_id'
                           AND is_deleted = '1'");
    while ($d = mysqli_fetch_assoc($r)) {
        $pid = intval($d['purchess_details_product_id']);
        $qty = floatval($d['purchess_details_product_qty']);
        runQuery($sql, "UPDATE tbl_product
                        SET product_stock = product_stock - $qty
                        WHERE product_id = '$pid'
                          AND company_id = '$company_id'
                          AND franchise_id = '$franchise_id'");
    }

    runQuery($sql, "UPDATE tbl_purchess_details
                    SET is_deleted = '0'
                    WHERE purchess_details_purches_id = '$purchase_id'
                      AND company_id = '$company_id'
                      AND is_deleted = '1'");
}

// Adds $amount to the vendor's outstanding (vendor_wallet). Pass a negative
// amount to reduce it. Returns the vendor's new outstanding balance.
function adjustVendorOutstanding($sql, $company_id, $vendor_id, $amount) {
    $vendor_id = intval($vendor_id);
    $amount    = round(floatval($amount), 2);

    runQuery($sql, "UPDATE tbl_vendor
                    SET vendor_wallet = vendor_wallet + ($amount), u_date = NOW()
                    WHERE vendor_id = '$vendor_id'
                      AND company_id = '$company_id'");

    $r = runQuery($sql, "SELECT vendor_wallet FROM tbl_vendor
                         WHERE vendor_id = '$vendor_id'
                           AND company_id = '$company_id'");
    $row = mysqli_fetch_assoc($r);
    if (!$row) {
        throw new Exception('Vendor not found while updating outstanding');
    }
    return round(floatval($row['vendor_wallet']), 2);
}

// Writes the purchase entry to tbl_transaction (credit: vendor outstanding up).
// $bill_number must already be escaped.
function insertPurchaseTransaction($sql, $company_id, $franchise_id, $financial_year_id, $purchase_id,
                                   $vendor_id, $amount, $date, $bill_number, $balance, $employee_id) {
    $type   = TXN_CREDIT;
    $remark = "Purchase bill $bill_number";

    runQuery($sql, "INSERT INTO tbl_transaction (
                        company_id, franchise_id, transaction_financial_year_id,
                        transaction_sell_id, transaction_purches_id,
                        transaction_customer_id, transaction_vendor_id,
                        transaction_account_id, transaction_expense_category_id,
                        transaction_sales_return_id, transaction_purches_return_id,
                        transaction_amount, transaction_type, transaction_date,
                        transaction_remark, transaction_balance,
                        transaction_employee_id, is_deleted, c_date
                    ) VALUES (
                        '$company_id', '$franchise_id', '" . intval($financial_year_id) . "',
                        NULL, '" . intval($purchase_id) . "',
                        NULL, '" . intval($vendor_id) . "',
                        NULL, NULL,
                        '0', '0',
                        '" . round(floatval($amount), 2) . "', '$type', '$date',
                        '$remark', '" . round(floatval($balance), 2) . "',
                        '" . intval($employee_id) . "', '1', NOW()
                    )");
}

// Soft-deletes ONLY the purchase (credit) entry of a bill, used on edit and delete.
// Payments (debit, with an account) and purchase returns of the same bill are never touched.
function voidPurchaseTransactions($sql, $company_id, $purchase_id) {
    runQuery($sql, "UPDATE tbl_transaction
                    SET is_deleted = '0'
                    WHERE transaction_purches_id = '" . intval($purchase_id) . "'
                      AND company_id = '$company_id'
                      AND transaction_type = '" . TXN_CREDIT . "'
                      AND COALESCE(transaction_account_id, 0) = 0
                      AND COALESCE(transaction_purches_return_id, 0) = 0
                      AND is_deleted = '1'");
}

// =====================================================================
// Request handling
// =====================================================================

switch ($type) {

    // ----- 1. Insert new purchase (header + details, stock in) -----
    case 1: {
        $built = buildLines($items);
        if (isset($built['error'])) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => $built['error']];
            break;
        }
        $lines  = $built['lines'];
        $totals = calcTotals($lines, $discount_type, $discount_value);
        if (isset($totals['error'])) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => $totals['error']];
            break;
        }

        try {
            $invalid = validatePurchase($sql, $company_id, $franchise_id, $vendor_id, $bill_number, $purchase_date, $lines);
            if ($invalid) {
                http_response_code($invalid[0]);
                $response = ['status' => 'error', 'message' => $invalid[1]];
                break;
            }

            $date_esc = mysqli_real_escape_string($sql, $purchase_date);

            mysqli_begin_transaction($sql);

            runQuery($sql, "INSERT INTO tbl_purchess (
                                company_id, franchise_id, purchess_financial_year_id,
                                purchess_bill_number, purchess_date, purchess_vendor_id,
                                purchess_remark, purchess_total_amount,
                                purches_total_discount_amount, purches_total_with_gst_amount,
                                purchess_return_total_amount, purchess_return_yes_no,
                                purchess_employee_id, is_deleted, c_date
                            ) VALUES (
                                '$company_id', '$franchise_id', '$financial_year_id',
                                '$bill_number', '$date_esc', '$vendor_id',
                                '$remark', '{$totals['subtotal']}',
                                '{$totals['discount']}', '{$totals['grand_total']}',
                                '0', '0',
                                '$employee_id', '1', NOW()
                            )");
            $new_id = mysqli_insert_id($sql);

            insertLines($sql, $company_id, $franchise_id, $new_id, $lines);

            // Vendor outstanding goes up by the bill amount, then log it
            $vendor_balance = adjustVendorOutstanding($sql, $company_id, $vendor_id, $totals['grand_total']);
            insertPurchaseTransaction(
                $sql, $company_id, $franchise_id, $financial_year_id, $new_id,
                $vendor_id, $totals['grand_total'], $date_esc, $bill_number,
                $vendor_balance, $employee_id
            );

            mysqli_commit($sql);

            logMessage('purchase', "New purchase added: Bill $bill_number (ID: $new_id), vendor outstanding: $vendor_balance", 'INFO');
            http_response_code(201);
            $response = [
                'status'             => 'success',
                'message'            => 'Purchase saved successfully',
                'purchase_id'        => $new_id,
                'totals'             => $totals,
                'vendor_outstanding' => $vendor_balance,
            ];
        } catch (Throwable $e) {
            mysqli_rollback($sql);
            logError('purchase', $e->getMessage());
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to save purchase: ' . $e->getMessage()];
        }
        break;
    }

    // ----- 2. Get all purchases (with vendor name + item count) -----
    case 2: {
        if (empty($company_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }
        if (empty($franchise_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Franchise ID is required'];
            break;
        }

        $filters = '';
        if ($financial_year_id > 0) {
            $filters .= " AND p.purchess_financial_year_id = '$financial_year_id'";
        }
        if (isValidDate($from_date)) {
            $filters .= " AND p.purchess_date >= '$from_date'";
        }
        if (isValidDate($to_date)) {
            $filters .= " AND p.purchess_date <= '$to_date'";
        }
        if ($vendor_id > 0) {
            $filters .= " AND p.purchess_vendor_id = '$vendor_id'";
        }

        // Per-bill item count, total qty and GST come from the detail rows
        $query = "SELECT
                    p.*,
                    v.vendor_name, v.vendor_mobile_no,
                    COALESCE(d.item_count, 0) AS item_count,
                    COALESCE(d.total_qty, 0)  AS total_qty,
                    COALESCE(d.total_gst, 0)  AS total_gst
                  FROM tbl_purchess AS p
                  LEFT JOIN tbl_vendor AS v ON v.vendor_id = p.purchess_vendor_id
                  LEFT JOIN (
                      SELECT purchess_details_purches_id,
                             COUNT(*) AS item_count,
                             SUM(purchess_details_product_qty) AS total_qty,
                             SUM(purchess_details_product_gst_price) AS total_gst
                      FROM tbl_purchess_details
                      WHERE company_id = '$company_id'
                        AND is_deleted = '1'
                      GROUP BY purchess_details_purches_id
                  ) AS d ON d.purchess_details_purches_id = p.purchess_id
                  WHERE p.company_id = '$company_id'
                    AND p.franchise_id = '$franchise_id'
                    AND p.is_deleted = '1'
                    $filters
                  ORDER BY p.purchess_date DESC, p.purchess_id DESC";

        $result = mysqli_query($sql, $query);

        if ($result) {
            $purchases = [];
            while ($row = mysqli_fetch_assoc($result)) {
                $purchases[] = $row;
            }
            logMessage('purchase', "Fetched " . count($purchases) . " purchases", 'INFO');
            http_response_code(200);
            $response = [
                'status'  => 'success',
                'message' => 'Purchases fetched successfully',
                'data'    => $purchases,
                'total'   => count($purchases),
            ];
        } else {
            $error = mysqli_error($sql);
            logError('purchase', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to fetch purchases: ' . $error];
        }
        break;
    }

    // ----- 3. Update purchase (reverse old stock, replace details) -----
    case 3: {
        if (empty($purchase_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Purchase ID is required'];
            break;
        }

        $built = buildLines($items);
        if (isset($built['error'])) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => $built['error']];
            break;
        }
        $lines  = $built['lines'];
        $totals = calcTotals($lines, $discount_type, $discount_value);
        if (isset($totals['error'])) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => $totals['error']];
            break;
        }

        try {
            $header = getPurchaseHeader($sql, $purchase_id, $company_id, $franchise_id);
            if (!$header) {
                http_response_code(404);
                $response = ['status' => 'error', 'message' => 'Purchase not found'];
                break;
            }
            if ($header['purchess_return_yes_no'] == '1') {
                http_response_code(409);
                $response = ['status' => 'error', 'message' => 'This purchase has a return entry and cannot be edited'];
                break;
            }

            // Bill already has payments: vendor can't change, total can't go below paid
            $paid = getBillPaid($sql, $company_id, $purchase_id);
            if ($paid > 0 && intval($header['purchess_vendor_id']) !== $vendor_id) {
                http_response_code(409);
                $response = [
                    'status'  => 'error',
                    'message' => "₹$paid is already paid against this bill, so the vendor can't be changed",
                ];
                break;
            }
            if ($paid > $totals['grand_total'] + 0.01) {
                http_response_code(409);
                $response = [
                    'status'  => 'error',
                    'message' => "₹$paid is already paid against this bill. The bill total can't be less than that.",
                ];
                break;
            }

            $invalid = validatePurchase($sql, $company_id, $franchise_id, $vendor_id, $bill_number, $purchase_date, $lines, $purchase_id);
            if ($invalid) {
                http_response_code($invalid[0]);
                $response = ['status' => 'error', 'message' => $invalid[1]];
                break;
            }

            $date_esc = mysqli_real_escape_string($sql, $purchase_date);

            mysqli_begin_transaction($sql);

            reverseLines($sql, $company_id, $franchise_id, $purchase_id);

            // Take the old bill amount off the old vendor and void its purchase entry
            adjustVendorOutstanding(
                $sql, $company_id,
                $header['purchess_vendor_id'],
                -floatval($header['purches_total_with_gst_amount'])
            );
            voidPurchaseTransactions($sql, $company_id, $purchase_id);

            runQuery($sql, "UPDATE tbl_purchess SET
                                purchess_bill_number = '$bill_number',
                                purchess_date = '$date_esc',
                                purchess_vendor_id = '$vendor_id',
                                purchess_remark = '$remark',
                                purchess_total_amount = '{$totals['subtotal']}',
                                purches_total_discount_amount = '{$totals['discount']}',
                                purches_total_with_gst_amount = '{$totals['grand_total']}',
                                u_date = NOW()
                            WHERE purchess_id = '$purchase_id'
                              AND company_id = '$company_id'
                              AND franchise_id = '$franchise_id'
                              AND is_deleted = '1'");

            insertLines($sql, $company_id, $franchise_id, $purchase_id, $lines);

            // Add the new bill amount to the (possibly changed) vendor
            $vendor_balance = adjustVendorOutstanding($sql, $company_id, $vendor_id, $totals['grand_total']);
            insertPurchaseTransaction(
                $sql, $company_id, $franchise_id,
                $header['purchess_financial_year_id'], $purchase_id,
                $vendor_id, $totals['grand_total'], $date_esc, $bill_number,
                $vendor_balance, $employee_id
            );

            mysqli_commit($sql);

            logMessage('purchase', "Purchase updated: Bill $bill_number (ID: $purchase_id), vendor outstanding: $vendor_balance", 'INFO');
            http_response_code(200);
            $response = [
                'status'             => 'success',
                'message'            => 'Purchase updated successfully',
                'totals'             => $totals,
                'vendor_outstanding' => $vendor_balance,
            ];
        } catch (Throwable $e) {
            mysqli_rollback($sql);
            logError('purchase', $e->getMessage());
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to update purchase: ' . $e->getMessage()];
        }
        break;
    }

    // ----- 4. Soft delete purchase (reverse stock) -----
    case 4: {
        if (empty($purchase_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Purchase ID is required'];
            break;
        }
        if (empty($company_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }

        try {
            $header = getPurchaseHeader($sql, $purchase_id, $company_id, $franchise_id);
            if (!$header) {
                http_response_code(404);
                $response = ['status' => 'error', 'message' => 'Purchase not found'];
                break;
            }
            if ($header['purchess_return_yes_no'] == '1') {
                http_response_code(409);
                $response = ['status' => 'error', 'message' => 'This purchase has a return entry and cannot be deleted'];
                break;
            }

            // Bill with payments can't be deleted
            $paid = getBillPaid($sql, $company_id, $purchase_id);
            if ($paid > 0) {
                http_response_code(409);
                $response = [
                    'status'  => 'error',
                    'message' => "₹$paid is paid against this bill. Delete its payments first.",
                ];
                break;
            }

            mysqli_begin_transaction($sql);

            reverseLines($sql, $company_id, $franchise_id, $purchase_id);

            // Remove the bill amount from the vendor's outstanding
            adjustVendorOutstanding(
                $sql, $company_id,
                $header['purchess_vendor_id'],
                -floatval($header['purches_total_with_gst_amount'])
            );
            voidPurchaseTransactions($sql, $company_id, $purchase_id);

            runQuery($sql, "UPDATE tbl_purchess
                            SET is_deleted = '0', u_date = NOW()
                            WHERE purchess_id = '$purchase_id'
                              AND company_id = '$company_id'
                              AND franchise_id = '$franchise_id'");

            mysqli_commit($sql);

            logMessage('purchase', "Purchase deleted (ID: $purchase_id)", 'INFO');
            http_response_code(200);
            $response = ['status' => 'success', 'message' => 'Purchase deleted successfully'];
        } catch (Throwable $e) {
            mysqli_rollback($sql);
            logError('purchase', $e->getMessage());
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to delete purchase: ' . $e->getMessage()];
        }
        break;
    }

    // ----- 5. Get single purchase with its items -----
    case 5: {
        if (empty($purchase_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Purchase ID is required'];
            break;
        }
        if (empty($company_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }

        try {
            $query = "SELECT p.*, v.vendor_name, v.vendor_mobile_no, v.vendor_gst_number, v.vendor_wallet
                      FROM tbl_purchess AS p
                      LEFT JOIN tbl_vendor AS v ON v.vendor_id = p.purchess_vendor_id
                      WHERE p.purchess_id = '$purchase_id'
                        AND p.company_id = '$company_id'
                        AND p.franchise_id = '$franchise_id'
                        AND p.is_deleted = '1'";
            $result = runQuery($sql, $query);

            if (mysqli_num_rows($result) > 0) {
                $purchase = mysqli_fetch_assoc($result);

                // Amount already paid against this bill (edit form can show / guard it)
                $purchase['paid_amount'] = getBillPaid($sql, $company_id, $purchase_id);

                $detailQuery = "SELECT d.*, pr.product_name, pr.product_sku, pr.product_mrp_with_gst
                                FROM tbl_purchess_details AS d
                                LEFT JOIN tbl_product AS pr ON pr.product_id = d.purchess_details_product_id
                                WHERE d.purchess_details_purches_id = '$purchase_id'
                                  AND d.company_id = '$company_id'
                                  AND d.is_deleted = '1'
                                ORDER BY d.purchess_details_id ASC";
                $detailResult = runQuery($sql, $detailQuery);

                $purchase['items'] = [];
                while ($row = mysqli_fetch_assoc($detailResult)) {
                    $purchase['items'][] = $row;
                }

                http_response_code(200);
                $response = ['status' => 'success', 'message' => 'Purchase fetched successfully', 'data' => $purchase];
            } else {
                http_response_code(404);
                $response = ['status' => 'error', 'message' => 'Purchase not found'];
            }
        } catch (Throwable $e) {
            logError('purchase', $e->getMessage());
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to fetch purchase: ' . $e->getMessage()];
        }
        break;
    }

    default:
        http_response_code(400);
        $response = ['status' => 'error', 'message' => 'Invalid request type'];
        logError('purchase', "Invalid request type: $type");
}

logResponse('purchase', $response);
echo json_encode($response);
mysqli_close($sql);
?>