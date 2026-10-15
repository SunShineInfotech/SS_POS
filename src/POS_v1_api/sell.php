<?php
// v1_api/sell.php
require_once 'dbconnection.php';

if (isset($GLOBALS['_RAW_INPUT'])) {
    $postData = json_decode($GLOBALS['_RAW_INPUT'], true);
} else {
    $postData = json_decode(file_get_contents('php://input'), true);
}

logRequest('sell', $postData);

if (empty($postData)) {
    http_response_code(400);
    $response = ['status' => 'error', 'message' => 'No data received'];
    logResponse('sell', $response);
    echo json_encode($response);
    exit;
}

$type = isset($postData['type']) ? intval($postData['type']) : 0;

// ----- Escape / normalize input -----
$company_id      = isset($postData['company_id']) ? mysqli_real_escape_string($sql, trim($postData['company_id'])) : '';
$franchise_id    = isset($postData['franchise_id']) ? mysqli_real_escape_string($sql, trim($postData['franchise_id'])) : '';
$sell_id         = isset($postData['sell_id']) ? intval($postData['sell_id']) : 0;
$financial_year  = isset($postData['sell_financial_year_id']) ? mysqli_real_escape_string($sql, trim($postData['sell_financial_year_id'])) : '';
$sell_date       = isset($postData['sell_date']) ? mysqli_real_escape_string($sql, trim($postData['sell_date'])) : date('Y-m-d');
$table_id        = isset($postData['sell_table_id']) ? mysqli_real_escape_string($sql, trim($postData['sell_table_id'])) : '';

$total_amount     = isset($postData['sell_total_amount']) ? floatval($postData['sell_total_amount']) : 0;
$discount_amount  = isset($postData['sell_total_discount_amount']) ? floatval($postData['sell_total_discount_amount']) : 0;
$paid_amount      = isset($postData['sales_total_paid_amount']) ? floatval($postData['sales_total_paid_amount']) : 0;
$remaining_amount = isset($postData['sales_total_remainng_amount']) ? floatval($postData['sales_total_remainng_amount']) : 0;
$ship_charge      = isset($postData['sell_total_ship_charge']) ? round(max(floatval($postData['sell_total_ship_charge']), 0), 2) : 0;
$labour_charge    = isset($postData['sell_total_lebar_charge']) ? round(max(floatval($postData['sell_total_lebar_charge']), 0), 2) : 0;

$customer_mobile = isset($postData['customer_mobile']) ? mysqli_real_escape_string($sql, trim($postData['customer_mobile'])) : '';
$customer_name   = isset($postData['customer_name']) ? mysqli_real_escape_string($sql, trim($postData['customer_name'])) : 'Walk-in';
$payment_mode    = isset($postData['payment_mode']) ? mysqli_real_escape_string($sql, trim($postData['payment_mode'])) : 'Cash';

// Cart line items — array of { product_id, single_product_price, qty, cgst, sgst,
// available_stock, discount_type, discount }
$items = (isset($postData['items']) && is_array($postData['items'])) ? $postData['items'] : [];

// tbl_transaction.transaction_transfer_type (same codes as purchase_payment.php).
// Card has no own code there, so it is recorded as Bank.
const SELL_TRANSFER_TYPES = ['Bank' => 1, 'Card' => 1, 'Cash' => 2, 'UPI' => 3];
// tbl_transaction.transaction_type: 2 = party outstanding goes down (payment received)
const SELL_TXN_PAYMENT = '2';

// Split payment lines — array of { mode: 'Cash'|'Card'|'UPI', amount }.
// null = not sent (older clients) — the bill keeps / derives a single-mode payment.
$payments = null;
if (isset($postData['payments']) && is_array($postData['payments'])) {
    $payments = [];
    foreach ($postData['payments'] as $p) {
        $mode = (is_array($p) && isset($p['mode']) && is_string($p['mode'])) ? trim($p['mode']) : '';
        $amt  = (is_array($p) && isset($p['amount']) && is_numeric($p['amount'])) ? round(floatval($p['amount']), 2) : 0;
        if (isset(SELL_TRANSFER_TYPES[$mode]) && $amt > 0) {
            // Same mode sent twice — merge
            $payments[$mode] = round(($payments[$mode] ?? 0) + $amt, 2);
        }
    }
}

$response = ['status' => 'error', 'message' => 'Invalid request'];
http_response_code(400);

// ----- Helper: payment lines + totals for a bill -----
// Returns [lines, paid, remaining, mode_label] or a string error message.
// $payments === null falls back to the old single payment_mode + paid amount.
function resolvePayments($payments, $total_amount, $paid_amount, $payment_mode) {
    if ($payments === null) {
        $lines = [];
        if ($paid_amount > 0) {
            $mode = isset(SELL_TRANSFER_TYPES[$payment_mode]) ? $payment_mode : 'Cash';
            $lines[$mode] = round($paid_amount, 2);
        }
    } else {
        $lines = $payments;
    }

    $paid = round(array_sum($lines), 2);
    if ($paid > round($total_amount, 2) + 0.01) {
        return 'Payment total (' . $paid . ') is more than the bill total (' . round($total_amount, 2) . ')';
    }
    $remaining = round(max($total_amount - $paid, 0), 2);
    $label     = !empty($lines) ? implode('+', array_keys($lines)) : ($payment_mode !== '' ? $payment_mode : 'Cash');

    return [$lines, $paid, $remaining, substr($label, 0, 20)];
}

// ----- Helper: one tbl_transaction row per payment mode of a bill -----
// Throws on failure so the caller's DB transaction rolls back.
function insertSellPayments($sql, $ctx, $lines) {
    $customer_value = $ctx['customer_id'] === null ? 'NULL' : "'" . intval($ctx['customer_id']) . "'";
    $balance        = round($ctx['total'], 2);

    foreach ($lines as $mode => $amount) {
        $balance = round($balance - $amount, 2);
        $remark  = mysqli_real_escape_string($sql, "Payment received for bill {$ctx['bill_number']} ($mode)");

        $query = "INSERT INTO tbl_transaction (
                      company_id, franchise_id, transaction_financial_year_id,
                      transaction_sell_id, transaction_purches_id,
                      transaction_customer_id, transaction_vendor_id,
                      transaction_account_id, transaction_expense_category_id,
                      transaction_sales_return_id, transaction_purches_return_id,
                      transaction_amount, transaction_type, transaction_date,
                      transaction_remark, transaction_balance,
                      transaction_transfer_type, transaction_number,
                      transaction_employee_id, is_deleted, c_date
                  ) VALUES (
                      '{$ctx['company_id']}', '{$ctx['franchise_id']}', '" . intval($ctx['financial_year']) . "',
                      '" . intval($ctx['sell_id']) . "', NULL,
                      $customer_value, NULL,
                      NULL, NULL,
                      '0', '0',
                      '" . number_format($amount, 2, '.', '') . "', '" . SELL_TXN_PAYMENT . "', '{$ctx['date']}',
                      '$remark', '" . number_format(max($balance, 0), 2, '.', '') . "',
                      '" . SELL_TRANSFER_TYPES[$mode] . "', NULL,
                      '0', '1', NOW()
                  )";

        if (!mysqli_query($sql, $query)) {
            throw new Exception('Failed to save payment: ' . mysqli_error($sql));
        }
    }
}

// ----- Helper: find customer by mobile, or create a new one -----
function findOrCreateCustomer($sql, $company_id, $mobile, $name) {
    if (empty($mobile)) {
        // No mobile given — treat as walk-in, no customer record.
        // Must be NULL, not 0 — tbl_sell.sell_customer_id has a foreign key
        // to tbl_customer.customer_id, and 0 doesn't exist there.
        return null;
    }

    $checkQuery = "SELECT customer_id FROM tbl_customer
                   WHERE company_id = '$company_id'
                     AND customer_mobile = '$mobile'
                     AND is_deleted = '1'
                   LIMIT 1";
    $checkResult = mysqli_query($sql, $checkQuery);

    if ($checkResult && mysqli_num_rows($checkResult) > 0) {
        $row = mysqli_fetch_assoc($checkResult);
        return intval($row['customer_id']);
    }

    // Not found — create a new customer
    $safeName = !empty($name) ? $name : 'Walk-in';
    $insertQuery = "INSERT INTO tbl_customer (
                        company_id, customer_name, customer_mobile, is_deleted, c_date
                    ) VALUES (
                        '$company_id', '$safeName', '$mobile', '1', NOW()
                    )";

    if (mysqli_query($sql, $insertQuery)) {
        return mysqli_insert_id($sql);
    }

    logError('sell', 'Failed to create customer: ' . mysqli_error($sql));
    return 0;
}

// ----- Helper: generate next bill number as INV-00001, INV-00002, ... -----
// Scoped per company + franchise. NOTE: under heavy concurrent billing this
// read-then-insert approach can theoretically race (two bills grabbing the
// same next number). Fine for single-till usage; wrap in a transaction /
// unique index + retry if you later run multiple tills in parallel.
function generateBillNumber($sql, $company_id, $franchise_id) {
    $query = "SELECT sell_bill_number FROM tbl_sell
              WHERE company_id = '$company_id'
                AND franchise_id = '$franchise_id'
              ORDER BY sell_id DESC
              LIMIT 1";
    $result = mysqli_query($sql, $query);

    $nextNumber = 1;
    if ($result && mysqli_num_rows($result) > 0) {
        $lastBill = mysqli_fetch_assoc($result)['sell_bill_number'];
        if (preg_match('/(\d+)$/', (string)$lastBill, $matches)) {
            $nextNumber = intval($matches[1]) + 1;
        }
    }

    return 'INV-' . str_pad((string)$nextNumber, 5, '0', STR_PAD_LEFT);
}

switch ($type) {

    // ----- 1. Create a new bill + its line items (from RestaurantBilling checkout) -----
    case 1: {
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
        if (empty($items)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'At least one cart item is required'];
            break;
        }

        $resolved = resolvePayments($payments, $total_amount, $paid_amount, $payment_mode);
        if (is_string($resolved)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => $resolved];
            break;
        }
        list($payment_lines, $paid_amount, $remaining_amount, $payment_mode_label) = $resolved;
        $payment_mode = mysqli_real_escape_string($sql, $payment_mode_label);

        // Requires InnoDB tables (tbl_sell, tbl_sell_details, tbl_customer) — MyISAM
        // ignores transactions silently and this would no longer be atomic.
        mysqli_begin_transaction($sql);

        $success  = true;
        $errorMsg = '';
        $new_id   = 0;

        $customer_id     = findOrCreateCustomer($sql, $company_id, $customer_mobile, $customer_name);
        $customer_id_sql = ($customer_id === null) ? 'NULL' : "'" . intval($customer_id) . "'";
        $bill_number     = generateBillNumber($sql, $company_id, $franchise_id);
        $payment_status  = ($remaining_amount <= 0) ? 'Paid' : 'Pending';

        // NOTE: sell_payment_mode is not in the tbl_sell schema you shared —
        // run this once before using this file:
        //   ALTER TABLE tbl_sell ADD COLUMN sell_payment_mode VARCHAR(20)
        //     NOT NULL DEFAULT 'Cash' AFTER sell_payment_stauts;
        $sellQuery = "INSERT INTO tbl_sell (
                        company_id, franchise_id, sell_financial_year_id,
                        sell_bill_number, sell_date, sell_customer_id,
                        sell_table_id, sell_total_amount, sell_total_discount_amount,
                        sell_total_ship_charge, sell_total_lebar_charge,
                        sales_total_paid_amount, sales_total_remainng_amount,
                        sell_customer_name, sell_customer_number,
                        sell_payment_stauts, sell_payment_mode,
                        is_deleted, c_date
                      ) VALUES (
                        '$company_id', '$franchise_id', '$financial_year',
                        '$bill_number', '$sell_date', $customer_id_sql,
                        '$table_id', '$total_amount', '$discount_amount',
                        '$ship_charge', '$labour_charge',
                        '$paid_amount', '$remaining_amount',
                        '$customer_name', '$customer_mobile',
                        '$payment_status', '$payment_mode',
                        '1', NOW()
                      )";

        if (mysqli_query($sql, $sellQuery)) {
            $new_id = mysqli_insert_id($sql);

            foreach ($items as $item) {
                $product_id    = isset($item['product_id']) ? intval($item['product_id']) : 0;
                $unit_price    = isset($item['single_product_price']) ? floatval($item['single_product_price']) : 0;
                $qty           = isset($item['qty']) ? floatval($item['qty']) : 0;
                $item_cgst     = isset($item['cgst']) ? floatval($item['cgst']) : 0;
                $item_sgst     = isset($item['sgst']) ? floatval($item['sgst']) : 0;
                $avail_stock   = isset($item['available_stock']) ? floatval($item['available_stock']) : 0;
                $discount_type = isset($item['discount_type']) ? mysqli_real_escape_string($sql, trim($item['discount_type'])) : '%';
                $item_discount = isset($item['discount']) ? floatval($item['discount']) : 0;

                if ($product_id <= 0 || $qty <= 0) {
                    // Skip malformed rows instead of failing the whole bill
                    continue;
                }

                $line_amount = $unit_price * $qty;
                $discount_amt = ($discount_type === '%')
                    ? ($line_amount * $item_discount) / 100
                    : $item_discount;
                $discount_amt = min(max($discount_amt, 0), $line_amount);
                $line_total = $line_amount - $discount_amt;

                $detailQuery = "INSERT INTO tbl_sell_details (
                                    company_id, sell_details_sell_id, sell_details_product_id,
                                    sell_details_single_product_price, sell_details_product_qty,
                                    sell_details_product_amount, sell_details_product_cgst,
                                    sell_details_product_sgst, sell_details_totall_amount,
                                    sell_details_product_avalable_stock, sell_product_returen,
                                    sell_details_discount_type, sell_details_product_discount,
                                    is_deleted, c_date
                                ) VALUES (
                                    '$company_id', '$new_id', '$product_id',
                                    '$unit_price', '$qty',
                                    '$line_amount', '$item_cgst',
                                    '$item_sgst', '$line_total',
                                    '$avail_stock', '0',
                                    '$discount_type', '$item_discount',
                                    '1', NOW()
                                )";

                if (!mysqli_query($sql, $detailQuery)) {
                    $success  = false;
                    $errorMsg = mysqli_error($sql);
                    break;
                }
            }

            // One payment row per mode (Cash / Card / UPI) in tbl_transaction
            if ($success) {
                try {
                    insertSellPayments($sql, [
                        'company_id'     => $company_id,
                        'franchise_id'   => $franchise_id,
                        'financial_year' => $financial_year,
                        'sell_id'        => $new_id,
                        'customer_id'    => $customer_id,
                        'bill_number'    => $bill_number,
                        'date'           => $sell_date,
                        'total'          => $total_amount,
                    ], $payment_lines);
                } catch (Throwable $e) {
                    $success  = false;
                    $errorMsg = $e->getMessage();
                }
            }
        } else {
            $success  = false;
            $errorMsg = mysqli_error($sql);
        }

        if ($success) {
            mysqli_commit($sql);
            logMessage('sell', "Bill saved: $bill_number (sell_id: $new_id) with " . count($items) . " item(s), paid $paid_amount via $payment_mode", 'INFO');
            http_response_code(201);
            $response = [
                'status' => 'success',
                'message' => 'Bill saved successfully',
                'sell_id' => $new_id,
                'sell_bill_number' => $bill_number,
                'sell_customer_id' => $customer_id
            ];
        } else {
            mysqli_rollback($sql);
            logError('sell', $errorMsg);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to save bill: ' . $errorMsg];
        }
        break;
    }

    // ----- 2. List sales (for Sales.tsx) -----
    // Returns both active and soft-deleted rows (is_deleted) so the DataTable's
    // restore action has something to work with — filter/hide in the UI.
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

        $query = "SELECT
                    tbls.sell_id, tbls.sell_bill_number, tbls.sell_date,
                    tbls.sell_customer_id, tbls.sell_customer_name, tbls.sell_customer_number,
                    tbls.sell_total_amount, tbls.sell_total_discount_amount,
                    tbls.sales_total_paid_amount, tbls.sales_total_remainng_amount,
                    tbls.sell_payment_stauts, tbls.sell_payment_mode,
                    tbls.sell_table_id, tbls.is_deleted, tbls.c_date,
                    (SELECT COUNT(*) FROM tbl_sell_details tbld
                       WHERE tbld.sell_details_sell_id = tbls.sell_id
                         AND tbld.is_deleted = '1') AS item_count
                  FROM tbl_sell AS tbls
                  WHERE tbls.company_id = '$company_id'
                    AND tbls.franchise_id = '$franchise_id'
                  ORDER BY tbls.sell_id DESC";

        $result = mysqli_query($sql, $query);

        if ($result) {
            $sales = [];
            while ($row = mysqli_fetch_assoc($result)) {
                $sales[] = $row;
            }
            logMessage('sell', "Fetched " . count($sales) . " sales", 'INFO');
            http_response_code(200);
            $response = [
                'status' => 'success',
                'message' => 'Sales fetched successfully',
                'data' => $sales,
                'total' => count($sales)
            ];
        } else {
            $error = mysqli_error($sql);
            logError('sell', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to fetch sales: ' . $error];
        }
        break;
    }

    // ----- 3. Update an existing bill + its line items (Edit Invoice panel) -----
    case 3: {
        if (empty($sell_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Sell ID is required'];
            break;
        }
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
        if (empty($items)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'At least one item is required'];
            break;
        }

        // Split payments sent -> totals come from them and tbl_transaction is re-synced
        $payment_lines = null;
        if ($payments !== null) {
            $resolved = resolvePayments($payments, $total_amount, $paid_amount, $payment_mode);
            if (is_string($resolved)) {
                http_response_code(400);
                $response = ['status' => 'error', 'message' => $resolved];
                break;
            }
            list($payment_lines, $paid_amount, $remaining_amount, $payment_mode_label) = $resolved;
            $payment_mode = mysqli_real_escape_string($sql, $payment_mode_label);
        }

        mysqli_begin_transaction($sql);

        $success  = true;
        $errorMsg = '';

        $customer_id     = findOrCreateCustomer($sql, $company_id, $customer_mobile, $customer_name);
        $customer_id_sql = ($customer_id === null) ? 'NULL' : "'" . intval($customer_id) . "'";
        $payment_status  = ($remaining_amount <= 0) ? 'Paid' : 'Pending';

        // Only touch the charges when the client sends them (older screens don't)
        $chargeSet = '';
        if (array_key_exists('sell_total_ship_charge', $postData)) {
            $chargeSet .= "sell_total_ship_charge = '$ship_charge',";
        }
        if (array_key_exists('sell_total_lebar_charge', $postData)) {
            $chargeSet .= "sell_total_lebar_charge = '$labour_charge',";
        }

        $updateQuery = "UPDATE tbl_sell SET
                            sell_customer_id = $customer_id_sql,
                            sell_customer_name = '$customer_name',
                            sell_customer_number = '$customer_mobile',
                            sell_date = '$sell_date',
                            sell_total_amount = '$total_amount',
                            sell_total_discount_amount = '$discount_amount',
                            $chargeSet
                            sales_total_paid_amount = '$paid_amount',
                            sales_total_remainng_amount = '$remaining_amount',
                            sell_payment_stauts = '$payment_status',
                            sell_payment_mode = '$payment_mode',
                            u_date = NOW()
                        WHERE sell_id = '$sell_id'
                          AND company_id = '$company_id'
                          AND franchise_id = '$franchise_id'";

        if (mysqli_query($sql, $updateQuery)) {
            // Simplest reliable approach: soft-delete every existing line item
            // for this bill, then re-insert the full item list sent from the
            // client. Avoids fragile diffing between old/new item sets, at the
            // cost of each save generating fresh sell_details_id rows (no
            // per-line edit history is kept).
            $wipeQuery = "UPDATE tbl_sell_details
                          SET is_deleted = '0'
                          WHERE sell_details_sell_id = '$sell_id'
                            AND company_id = '$company_id'";

            if (mysqli_query($sql, $wipeQuery)) {
                foreach ($items as $item) {
                    $product_id    = isset($item['product_id']) ? intval($item['product_id']) : 0;
                    $unit_price    = isset($item['single_product_price']) ? floatval($item['single_product_price']) : 0;
                    $qty           = isset($item['qty']) ? floatval($item['qty']) : 0;
                    $item_cgst     = isset($item['cgst']) ? floatval($item['cgst']) : 0;
                    $item_sgst     = isset($item['sgst']) ? floatval($item['sgst']) : 0;
                    $avail_stock   = isset($item['available_stock']) ? floatval($item['available_stock']) : 0;
                    $discount_type = isset($item['discount_type']) ? mysqli_real_escape_string($sql, trim($item['discount_type'])) : '%';
                    $item_discount = isset($item['discount']) ? floatval($item['discount']) : 0;

                    if ($product_id <= 0 || $qty <= 0) {
                        continue;
                    }

                    $line_amount = $unit_price * $qty;
                    $discount_amt = ($discount_type === '%')
                        ? ($line_amount * $item_discount) / 100
                        : $item_discount;
                    $discount_amt = min(max($discount_amt, 0), $line_amount);
                    $line_total = $line_amount - $discount_amt;

                    $detailQuery = "INSERT INTO tbl_sell_details (
                                        company_id, sell_details_sell_id, sell_details_product_id,
                                        sell_details_single_product_price, sell_details_product_qty,
                                        sell_details_product_amount, sell_details_product_cgst,
                                        sell_details_product_sgst, sell_details_totall_amount,
                                        sell_details_product_avalable_stock, sell_product_returen,
                                        sell_details_discount_type, sell_details_product_discount,
                                        is_deleted, c_date
                                    ) VALUES (
                                        '$company_id', '$sell_id', '$product_id',
                                        '$unit_price', '$qty',
                                        '$line_amount', '$item_cgst',
                                        '$item_sgst', '$line_total',
                                        '$avail_stock', '0',
                                        '$discount_type', '$item_discount',
                                        '1', NOW()
                                    )";

                    if (!mysqli_query($sql, $detailQuery)) {
                        $success  = false;
                        $errorMsg = mysqli_error($sql);
                        break;
                    }
                }
            } else {
                $success  = false;
                $errorMsg = mysqli_error($sql);
            }

            // Replace this bill's payment rows with the new split
            if ($success && $payment_lines !== null) {
                try {
                    $billResult = mysqli_query($sql, "SELECT sell_bill_number, sell_financial_year_id
                                                      FROM tbl_sell
                                                      WHERE sell_id = '$sell_id'
                                                        AND company_id = '$company_id'");
                    $billRow = $billResult ? mysqli_fetch_assoc($billResult) : null;

                    if (!mysqli_query($sql, "UPDATE tbl_transaction
                                             SET is_deleted = '0'
                                             WHERE transaction_sell_id = '$sell_id'
                                               AND company_id = '$company_id'
                                               AND transaction_type = '" . SELL_TXN_PAYMENT . "'
                                               AND is_deleted = '1'")) {
                        throw new Exception(mysqli_error($sql));
                    }

                    insertSellPayments($sql, [
                        'company_id'     => $company_id,
                        'franchise_id'   => $franchise_id,
                        'financial_year' => $billRow ? $billRow['sell_financial_year_id'] : $financial_year,
                        'sell_id'        => $sell_id,
                        'customer_id'    => $customer_id,
                        'bill_number'    => $billRow ? $billRow['sell_bill_number'] : "#$sell_id",
                        'date'           => $sell_date,
                        'total'          => $total_amount,
                    ], $payment_lines);
                } catch (Throwable $e) {
                    $success  = false;
                    $errorMsg = $e->getMessage();
                }
            }
        } else {
            $success  = false;
            $errorMsg = mysqli_error($sql);
        }

        if ($success) {
            mysqli_commit($sql);
            logMessage('sell', "Bill updated (sell_id: $sell_id) with " . count($items) . " item(s)", 'INFO');
            http_response_code(200);
            $response = [
                'status' => 'success',
                'message' => 'Bill updated successfully',
                'sell_id' => $sell_id
            ];
        } else {
            mysqli_rollback($sql);
            logError('sell', $errorMsg);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to update bill: ' . $errorMsg];
        }
        break;
    }

    // ----- 4. Soft delete a bill -----
    case 4: {
        if (empty($sell_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Sell ID is required'];
            break;
        }
        if (empty($company_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }

        $query = "UPDATE tbl_sell
                  SET is_deleted = '0'
                  WHERE sell_id = '$sell_id'
                    AND company_id = '$company_id'
                    AND franchise_id = '$franchise_id'";

        if (mysqli_query($sql, $query)) {
            if (mysqli_affected_rows($sql) === 0) {
                http_response_code(404);
                $response = ['status' => 'error', 'message' => 'Bill not found'];
            } else {
                logMessage('sell', "Bill deleted (sell_id: $sell_id)", 'INFO');
                http_response_code(200);
                $response = ['status' => 'success', 'message' => 'Bill deleted successfully'];
            }
        } else {
            $error = mysqli_error($sql);
            logError('sell', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to delete bill: ' . $error];
        }
        break;
    }

    // ----- 5. Get a single bill with its line items (Edit Invoice panel) -----
    case 5: {
        if (empty($sell_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Sell ID is required'];
            break;
        }
        if (empty($company_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }

        $sellQuery = "SELECT * FROM tbl_sell
                      WHERE sell_id = '$sell_id'
                        AND company_id = '$company_id'
                        AND franchise_id = '$franchise_id'";
        $sellResult = mysqli_query($sql, $sellQuery);

        if ($sellResult && mysqli_num_rows($sellResult) > 0) {
            $sellRow = mysqli_fetch_assoc($sellResult);

            $itemsQuery = "SELECT
                              sd.sell_details_id, sd.sell_details_product_id,
                              sd.sell_details_single_product_price, sd.sell_details_product_qty,
                              sd.sell_details_product_amount, sd.sell_details_product_cgst,
                              sd.sell_details_product_sgst, sd.sell_details_totall_amount,
                              sd.sell_details_product_avalable_stock,
                              sd.sell_details_discount_type, sd.sell_details_product_discount,
                              p.product_name
                           FROM tbl_sell_details sd
                           LEFT JOIN tbl_product p ON p.product_id = sd.sell_details_product_id
                           WHERE sd.sell_details_sell_id = '$sell_id'
                             AND sd.is_deleted = '1'";
            $itemsResult = mysqli_query($sql, $itemsQuery);

            $items = [];
            if ($itemsResult) {
                while ($row = mysqli_fetch_assoc($itemsResult)) {
                    $items[] = $row;
                }
            }
            $sellRow['items'] = $items;

            // Payment lines (split payments) of this bill
            $payRows = [];
            $payResult = mysqli_query($sql, "SELECT transaction_id, transaction_amount,
                                                    transaction_transfer_type, transaction_remark,
                                                    transaction_date
                                             FROM tbl_transaction
                                             WHERE transaction_sell_id = '$sell_id'
                                               AND company_id = '$company_id'
                                               AND transaction_type = '" . SELL_TXN_PAYMENT . "'
                                               AND is_deleted = '1'
                                             ORDER BY transaction_id ASC");
            if ($payResult) {
                while ($row = mysqli_fetch_assoc($payResult)) {
                    $payRows[] = $row;
                }
            }
            $sellRow['payments'] = $payRows;

            logMessage('sell', "Fetched bill sell_id: $sell_id with " . count($items) . " item(s)", 'INFO');
            http_response_code(200);
            $response = ['status' => 'success', 'message' => 'Bill fetched successfully', 'data' => $sellRow];
        } else {
            http_response_code(404);
            $response = ['status' => 'error', 'message' => 'Bill not found'];
        }
        break;
    }

    // ----- 6. Restore a soft-deleted bill -----
    case 6: {
        if (empty($sell_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Sell ID is required'];
            break;
        }
        if (empty($company_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }

        $query = "UPDATE tbl_sell
                  SET is_deleted = '1'
                  WHERE sell_id = '$sell_id'
                    AND company_id = '$company_id'
                    AND franchise_id = '$franchise_id'";

        if (mysqli_query($sql, $query)) {
            if (mysqli_affected_rows($sql) === 0) {
                http_response_code(404);
                $response = ['status' => 'error', 'message' => 'Bill not found'];
            } else {
                logMessage('sell', "Bill restored (sell_id: $sell_id)", 'INFO');
                http_response_code(200);
                $response = ['status' => 'success', 'message' => 'Bill restored successfully'];
            }
        } else {
            $error = mysqli_error($sql);
            logError('sell', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to restore bill: ' . $error];
        }
        break;
    }

    default:
        http_response_code(400);
        $response = ['status' => 'error', 'message' => 'Invalid request type'];
        logError('sell', "Invalid request type: $type");
}

logResponse('sell', $response);
echo json_encode($response);
mysqli_close($sql);
?>