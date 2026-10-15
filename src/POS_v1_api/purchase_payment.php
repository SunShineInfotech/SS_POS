<?php
// v1_api/purchase_payment.php
//
// Purchase Payment (paying vendors)
//   type 1 = Add payment    -> one or more bills (or on account). Amount is split over the
//                              selected bills, oldest bill first, one tbl_transaction row per bill.
//                              Vendor outstanding -, account balance -.
//   type 2 = Vendor ledger  -> all active transactions of a vendor (debit / credit / balance)
//   type 3 = Vendor bills   -> purchases of a vendor with paid / pending
//   type 4 = Delete payment -> reverses vendor outstanding + account balance, soft-deletes the row,
//                              corrects the balance of later rows of that vendor
//   type 5 = Account list   -> accounts with current balance
//   type 6 = Edit payment   -> change amount / account / transfer type / ref no. / date / remark.
//                              Vendor outstanding, account balance(s) and the balance of this row
//                              and later rows of the vendor are corrected by the difference.
//
// tbl_transaction.transaction_balance = vendor outstanding right after that row was written.
require_once 'dbconnection.php';

// =====================================================================
// Constants
// =====================================================================

// tbl_transaction.transaction_type (party ledger view)
const TXN_CREDIT = '1'; // vendor outstanding goes up   (purchase)
const TXN_DEBIT  = '2'; // vendor outstanding goes down (payment, purchase return)

// tbl_transaction.transaction_transfer_type
const TRANSFER_TYPES = [1 => 'Bank', 2 => 'Cash', 3 => 'UPI'];

const MAX_BILLS_PER_PAYMENT = 100;
const MAX_AMOUNT            = 999999999.99;
const MAX_REMARK_LENGTH     = 500;
const MAX_NUMBER_LENGTH     = 100;
const APP_TIMEZONE          = 'Asia/Kolkata';

// =====================================================================
// Helpers
// =====================================================================

// Error that is safe to show to the user, with its HTTP code
class ApiException extends Exception {
    private $httpCode;

    public function __construct($message, $httpCode = 400) {
        parent::__construct($message);
        $this->httpCode = $httpCode;
    }

    public function getHttpCode() {
        return $this->httpCode;
    }
}

// Runs a query and throws on failure (works with or without mysqli exception mode)
function runQuery($sql, $query) {
    $result = mysqli_query($sql, $query);
    if ($result === false) {
        throw new Exception(mysqli_error($sql));
    }
    return $result;
}

function money($n) {
    return round(floatval($n), 2);
}

// Plain decimal string for SQL (never scientific notation)
function sqlMoney($n) {
    return number_format(money($n), 2, '.', '');
}

// Trims, removes control characters (keeps tab / newline) and cuts to $max characters
function cleanText($value, $max) {
    if (!is_scalar($value)) {
        return '';
    }
    $value = trim((string) $value);
    $clean = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value);
    if ($clean === null) {
        return ''; // invalid UTF-8
    }
    return function_exists('mb_substr')
        ? mb_substr($clean, 0, $max, 'UTF-8')
        : substr($clean, 0, $max);
}

function inputInt($data, $key) {
    return (isset($data[$key]) && is_scalar($data[$key])) ? intval($data[$key]) : 0;
}

function inputAmount($data, $key) {
    return (isset($data[$key]) && is_numeric($data[$key])) ? money($data[$key]) : 0;
}

function inputText($data, $key, $max) {
    return isset($data[$key]) ? cleanText($data[$key], $max) : '';
}

// Valid Y-m-d and not in the future
function isValidPastDate($date) {
    if (!is_string($date) || $date === '') {
        return false;
    }
    $tz = new DateTimeZone(APP_TIMEZONE);
    $d  = DateTime::createFromFormat('!Y-m-d', $date, $tz);
    if (!$d || $d->format('Y-m-d') !== $date) {
        return false;
    }
    return $d <= new DateTime('today', $tz);
}

// SQL condition that matches vendor PAYMENT rows only
// (debit + paid from an account, not a purchase return)
function paymentCondition($alias = 't') {
    return "($alias.transaction_type = '" . TXN_DEBIT . "'
             AND $alias.transaction_account_id > 0
             AND COALESCE($alias.transaction_purches_return_id, 0) = 0)";
}

function assertScope($company_id, $franchise_id) {
    if ($company_id === '') {
        throw new ApiException('Company ID is required');
    }
    if ($franchise_id === '') {
        throw new ApiException('Franchise ID is required');
    }
}

// Common checks for add / edit
function validatePaymentFields($account_id, $transfer_type, $amount, $date) {
    if ($account_id <= 0) {
        throw new ApiException('Select an account');
    }
    if (!array_key_exists($transfer_type, TRANSFER_TYPES)) {
        throw new ApiException('Select a transfer type (Bank, Cash or UPI)');
    }
    if ($amount <= 0) {
        throw new ApiException('Amount must be greater than 0');
    }
    if ($amount > MAX_AMOUNT) {
        throw new ApiException('Amount is too large');
    }
    if (!isValidPastDate($date)) {
        throw new ApiException('Enter a valid transaction date (future dates are not allowed)');
    }
}

// $lock = true locks the vendor row until commit, so two payments
// for the same vendor can't be saved at the same time
function getVendor($sql, $company_id, $vendor_id, $lock = false) {
    $r = runQuery($sql, "SELECT vendor_id, vendor_name, vendor_wallet
                         FROM tbl_vendor
                         WHERE vendor_id = '" . intval($vendor_id) . "'
                           AND company_id = '$company_id'
                           AND is_deleted = '1'" . ($lock ? ' FOR UPDATE' : ''));
    return mysqli_num_rows($r) > 0 ? mysqli_fetch_assoc($r) : null;
}

function getAccount($sql, $company_id, $franchise_id, $account_id) {
    $r = runQuery($sql, "SELECT account_id, account_name, account_balance
                         FROM tbl_account
                         WHERE account_id = '" . intval($account_id) . "'
                           AND company_id = '$company_id'
                           AND franchise_id = '$franchise_id'
                           AND is_deleted = '1'");
    return mysqli_num_rows($r) > 0 ? mysqli_fetch_assoc($r) : null;
}

// One active payment row (scoped to company + franchise), or null
function getPaymentTransaction($sql, $company_id, $franchise_id, $transaction_id, $lock = false) {
    $cond = paymentCondition('t');
    $r = runQuery($sql, "SELECT t.transaction_id, t.transaction_vendor_id, t.transaction_account_id,
                                t.transaction_purches_id, t.transaction_amount
                         FROM tbl_transaction AS t
                         WHERE t.transaction_id = '" . intval($transaction_id) . "'
                           AND t.company_id = '$company_id'
                           AND t.franchise_id = '$franchise_id'
                           AND t.transaction_vendor_id > 0
                           AND t.is_deleted = '1'
                           AND $cond" . ($lock ? ' FOR UPDATE' : ''));
    return mysqli_num_rows($r) > 0 ? mysqli_fetch_assoc($r) : null;
}

// Turns a purchase row (+ paid) into amounts and status
function billSummary($row) {
    $grand    = money($row['purches_total_with_gst_amount']);
    $returned = money($row['purchess_return_total_amount']);
    $paid     = money($row['paid']);
    $pending  = money(max(0, $grand - $returned - $paid));

    if ($pending <= 0) {
        $status = 'paid';
    } elseif ($paid > 0) {
        $status = 'partial';
    } else {
        $status = 'unpaid';
    }

    return [
        'grand'    => $grand,
        'returned' => $returned,
        'paid'     => $paid,
        'pending'  => $pending,
        'status'   => $status,
    ];
}

// One bill of a vendor with paid / pending, or null
function getBillDue($sql, $company_id, $franchise_id, $purchase_id, $vendor_id) {
    $cond = paymentCondition('t');
    $r = runQuery($sql, "SELECT p.purchess_id, p.purchess_bill_number, p.purchess_date,
                                p.purches_total_with_gst_amount, p.purchess_return_total_amount,
                                (SELECT COALESCE(SUM(t.transaction_amount), 0)
                                 FROM tbl_transaction AS t
                                 WHERE t.transaction_purches_id = p.purchess_id
                                   AND t.company_id = p.company_id
                                   AND t.is_deleted = '1'
                                   AND $cond) AS paid
                         FROM tbl_purchess AS p
                         WHERE p.purchess_id = '" . intval($purchase_id) . "'
                           AND p.company_id = '$company_id'
                           AND p.franchise_id = '$franchise_id'
                           AND p.purchess_vendor_id = '" . intval($vendor_id) . "'
                           AND p.is_deleted = '1'");
    if (mysqli_num_rows($r) === 0) {
        return null;
    }
    $row = mysqli_fetch_assoc($r);
    return array_merge([
        'purchase_id' => intval($row['purchess_id']),
        'bill_number' => (string) $row['purchess_bill_number'],
        'date'        => (string) $row['purchess_date'],
    ], billSummary($row));
}

// Loads the selected bills, checks they are payable, sorts oldest first. Throws ApiException.
function loadSelectedBills($sql, $company_id, $franchise_id, $vendor_id, $purchase_ids) {
    $bills = [];
    foreach ($purchase_ids as $pid) {
        $bill = getBillDue($sql, $company_id, $franchise_id, $pid, $vendor_id);
        if (!$bill) {
            throw new ApiException('A selected bill was not found for this vendor. Reload the page and try again.', 404);
        }
        if ($bill['pending'] <= 0) {
            throw new ApiException("Bill {$bill['bill_number']} is already fully paid. Remove it and try again.", 409);
        }
        $bills[] = $bill;
    }

    usort($bills, function ($a, $b) {
        $byDate = strcmp($a['date'], $b['date']);
        return $byDate !== 0 ? $byDate : ($a['purchase_id'] <=> $b['purchase_id']);
    });

    return $bills;
}

// Splits $amount over the bills, oldest first.
// Returns [['bill' => bill|null, 'amount' => x], ...]. No bills = one on-account row.
function allocateAmount($bills, $amount) {
    $left = money($amount);
    if (empty($bills)) {
        return [['bill' => null, 'amount' => $left]];
    }

    $rows = [];
    foreach ($bills as $b) {
        if ($left <= 0) {
            break;
        }
        $part   = money(min($left, $b['pending']));
        $rows[] = ['bill' => $b, 'amount' => $part];
        $left   = money($left - $part);
    }
    return $rows;
}

// Adds $amount to vendor_wallet (negative to reduce). Returns new outstanding.
function adjustVendorOutstanding($sql, $company_id, $vendor_id, $amount) {
    $vendor_id = intval($vendor_id);

    runQuery($sql, "UPDATE tbl_vendor
                    SET vendor_wallet = vendor_wallet + (" . sqlMoney($amount) . "), u_date = NOW()
                    WHERE vendor_id = '$vendor_id'
                      AND company_id = '$company_id'");

    $r = runQuery($sql, "SELECT vendor_wallet FROM tbl_vendor
                         WHERE vendor_id = '$vendor_id'
                           AND company_id = '$company_id'");
    $row = mysqli_fetch_assoc($r);
    if (!$row) {
        throw new Exception('Vendor not found while updating outstanding');
    }
    return money($row['vendor_wallet']);
}

// Adds $amount to account_balance (negative to reduce). Returns new balance.
function adjustAccountBalance($sql, $company_id, $account_id, $amount) {
    $account_id = intval($account_id);

    runQuery($sql, "UPDATE tbl_account
                    SET account_balance = account_balance + (" . sqlMoney($amount) . "), u_date = NOW()
                    WHERE account_id = '$account_id'
                      AND company_id = '$company_id'");

    $r = runQuery($sql, "SELECT account_balance FROM tbl_account
                         WHERE account_id = '$account_id'
                           AND company_id = '$company_id'");
    $row = mysqli_fetch_assoc($r);
    if (!$row) {
        throw new Exception('Account not found while updating balance');
    }
    return money($row['account_balance']);
}

// transaction_balance is the vendor outstanding after each row (in insert order).
// When an older row changes by X, every row from $from_transaction_id onwards moves by X too.
function shiftVendorBalances($sql, $company_id, $vendor_id, $from_transaction_id, $amount) {
    if (money($amount) == 0) {
        return;
    }
    runQuery($sql, "UPDATE tbl_transaction
                    SET transaction_balance = transaction_balance + (" . sqlMoney($amount) . ")
                    WHERE company_id = '$company_id'
                      AND transaction_vendor_id = '" . intval($vendor_id) . "'
                      AND transaction_id >= '" . intval($from_transaction_id) . "'
                      AND is_deleted = '1'");
}

function autoRemark($vendor_name, $bill_number, $is_part) {
    $text = 'Payment to ' . $vendor_name;
    if ($bill_number !== null && $bill_number !== '') {
        $text .= ' against bill ' . $bill_number;
        if ($is_part) {
            $text .= ' (part)';
        }
    }
    return $text;
}

// Writes one payment (debit) row. $p['remark'], $p['number'], $p['date'] must already be escaped.
// Returns the new transaction_id.
function insertPaymentTransaction($sql, $p) {
    $purches_value = $p['purchase_id'] > 0 ? "'" . intval($p['purchase_id']) . "'" : 'NULL';
    $number_value  = $p['number'] !== '' ? "'{$p['number']}'" : 'NULL';

    runQuery($sql, "INSERT INTO tbl_transaction (
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
                        '{$p['company_id']}', '{$p['franchise_id']}', '" . intval($p['financial_year_id']) . "',
                        NULL, $purches_value,
                        NULL, '" . intval($p['vendor_id']) . "',
                        '" . intval($p['account_id']) . "', NULL,
                        '0', '0',
                        '" . sqlMoney($p['amount']) . "', '" . TXN_DEBIT . "', '{$p['date']}',
                        '{$p['remark']}', '" . sqlMoney($p['balance']) . "',
                        '" . intval($p['transfer_type']) . "', $number_value,
                        '" . intval($p['employee_id']) . "', '1', NOW()
                    )");
    return mysqli_insert_id($sql);
}

// Rolls back and builds the error response. DB / PHP errors are logged, never sent to the client.
function errorResponse($sql, Throwable $e, $fallback) {
    try {
        mysqli_rollback($sql);
    } catch (Throwable $ignored) {
    }
    if ($e instanceof ApiException) {
        http_response_code($e->getHttpCode());
        return ['status' => 'error', 'message' => $e->getMessage()];
    }
    logError('purchase_payment', $fallback . ': ' . $e->getMessage());
    http_response_code(500);
    return ['status' => 'error', 'message' => $fallback . '. Please try again.'];
}

// =====================================================================
// Input
// =====================================================================

$raw      = isset($GLOBALS['_RAW_INPUT']) ? $GLOBALS['_RAW_INPUT'] : file_get_contents('php://input');
$postData = json_decode($raw, true);

logRequest('purchase_payment', $postData);

if (empty($postData) || !is_array($postData)) {
    http_response_code(400);
    $response = ['status' => 'error', 'message' => 'No data received'];
    logResponse('purchase_payment', $response);
    echo json_encode($response);
    exit;
}

$type = inputInt($postData, 'type');

// ----- Scope -----
$company_id   = mysqli_real_escape_string($sql, inputText($postData, 'company_id', 50));
$franchise_id = mysqli_real_escape_string($sql, inputText($postData, 'franchise_id', 50));

// ----- Fields -----
$financial_year_id  = inputInt($postData, 'financial_year_id');
$employee_id        = inputInt($postData, 'employee_id');
$transaction_id     = inputInt($postData, 'transaction_id');
$vendor_id          = inputInt($postData, 'vendor_id');
$account_id         = inputInt($postData, 'account_id');
$transfer_type      = inputInt($postData, 'transfer_type');
$amount             = inputAmount($postData, 'amount');
$transaction_number = mysqli_real_escape_string($sql, inputText($postData, 'transaction_number', MAX_NUMBER_LENGTH));
$transaction_date   = inputText($postData, 'transaction_date', 10);
$remark             = mysqli_real_escape_string($sql, inputText($postData, 'remark', MAX_REMARK_LENGTH));

// Bills to pay: purchase_ids[] (multiple) or purchase_id (single, older clients)
$purchase_ids = [];
if (isset($postData['purchase_ids']) && is_array($postData['purchase_ids'])) {
    foreach ($postData['purchase_ids'] as $pid) {
        $pid = is_scalar($pid) ? intval($pid) : 0;
        if ($pid > 0) {
            $purchase_ids[$pid] = $pid;
        }
    }
} elseif (inputInt($postData, 'purchase_id') > 0) {
    $pid = inputInt($postData, 'purchase_id');
    $purchase_ids[$pid] = $pid;
}
$purchase_ids = array_values($purchase_ids);

$response = ['status' => 'error', 'message' => 'Invalid request'];
http_response_code(400);

// =====================================================================
// Request handling
// =====================================================================

switch ($type) {

    // ----- 1. Add payment (one or more bills, or on account) -----
    case 1: {
        try {
            assertScope($company_id, $franchise_id);
            if ($financial_year_id <= 0) {
                throw new ApiException('Financial year is required. Please sign in again.');
            }
            if ($vendor_id <= 0) {
                throw new ApiException('Select a vendor');
            }
            validatePaymentFields($account_id, $transfer_type, $amount, $transaction_date);
            if (count($purchase_ids) > MAX_BILLS_PER_PAYMENT) {
                throw new ApiException('You can pay up to ' . MAX_BILLS_PER_PAYMENT . ' bills in one payment');
            }

            mysqli_begin_transaction($sql);

            $vendor = getVendor($sql, $company_id, $vendor_id, true);
            if (!$vendor) {
                throw new ApiException('Selected vendor was not found', 404);
            }
            if (!getAccount($sql, $company_id, $franchise_id, $account_id)) {
                throw new ApiException('Selected account was not found', 404);
            }

            // Checked after the vendor lock, so pending can't change in between
            $bills = loadSelectedBills($sql, $company_id, $franchise_id, $vendor_id, $purchase_ids);
            if (!empty($bills)) {
                $total_pending = money(array_sum(array_column($bills, 'pending')));
                if ($amount > $total_pending + 0.01) {
                    throw new ApiException(count($bills) === 1
                        ? "Bill {$bills[0]['bill_number']} has only $total_pending pending. Enter that amount or less."
                        : "The selected bills have only $total_pending pending. Enter that amount or less.", 409);
                }
            }

            $rows     = allocateAmount($bills, $amount);
            $date_esc = mysqli_real_escape_string($sql, $transaction_date);

            $created         = [];
            $vendor_balance  = 0;
            $account_balance = 0;

            foreach ($rows as $row) {
                $part = $row['amount'];
                $bill = $row['bill'];

                $vendor_balance  = adjustVendorOutstanding($sql, $company_id, $vendor_id, -$part);
                $account_balance = adjustAccountBalance($sql, $company_id, $account_id, -$part);

                $row_remark = $remark !== ''
                    ? $remark
                    : mysqli_real_escape_string($sql, autoRemark(
                        $vendor['vendor_name'],
                        $bill ? $bill['bill_number'] : null,
                        $bill && $part < $bill['pending']
                    ));

                $new_id = insertPaymentTransaction($sql, [
                    'company_id'        => $company_id,
                    'franchise_id'      => $franchise_id,
                    'financial_year_id' => $financial_year_id,
                    'purchase_id'       => $bill ? $bill['purchase_id'] : 0,
                    'vendor_id'         => $vendor_id,
                    'account_id'        => $account_id,
                    'amount'            => $part,
                    'date'              => $date_esc,
                    'remark'            => $row_remark,
                    'balance'           => $vendor_balance,
                    'transfer_type'     => $transfer_type,
                    'number'            => $transaction_number,
                    'employee_id'       => $employee_id,
                ]);

                $created[] = [
                    'transaction_id' => $new_id,
                    'purchase_id'    => $bill ? $bill['purchase_id'] : null,
                    'bill_number'    => $bill ? $bill['bill_number'] : null,
                    'amount'         => $part,
                    'full'           => $bill ? ($part >= $bill['pending']) : null,
                ];
            }

            mysqli_commit($sql);

            logMessage('purchase_payment',
                'Payment added: vendor ' . $vendor_id . ', amount ' . $amount . ', rows ' . count($created)
                . ', outstanding ' . $vendor_balance . ', account ' . $account_id . ' balance ' . $account_balance
                . ', by employee ' . $employee_id,
                'INFO');
            http_response_code(201);
            $response = [
                'status'             => 'success',
                'message'            => 'Payment saved successfully',
                'transaction_ids'    => array_column($created, 'transaction_id'),
                'allocations'        => $created,
                'vendor_outstanding' => $vendor_balance,
                'account_id'         => $account_id,
                'account_balance'    => $account_balance,
            ];
        } catch (Throwable $e) {
            $response = errorResponse($sql, $e, 'Failed to save payment');
        }
        break;
    }

    // ----- 2. Vendor ledger (all transactions of a vendor) -----
    case 2: {
        try {
            assertScope($company_id, $franchise_id);
            if ($vendor_id <= 0) {
                throw new ApiException('Vendor ID is required');
            }

            $vendor = getVendor($sql, $company_id, $vendor_id);
            if (!$vendor) {
                throw new ApiException('Vendor not found', 404);
            }

            $cond = paymentCondition('t');
            $r = runQuery($sql, "SELECT t.transaction_id, t.transaction_date, t.transaction_type,
                                        t.transaction_amount, t.transaction_remark, t.transaction_balance,
                                        t.transaction_transfer_type, t.transaction_number,
                                        t.transaction_purches_id, t.transaction_account_id,
                                        a.account_name, p.purchess_bill_number,
                                        CASE WHEN $cond THEN 1 ELSE 0 END AS is_payment
                                 FROM tbl_transaction AS t
                                 LEFT JOIN tbl_account AS a ON a.account_id = t.transaction_account_id
                                 LEFT JOIN tbl_purchess AS p ON p.purchess_id = t.transaction_purches_id
                                 WHERE t.company_id = '$company_id'
                                   AND t.franchise_id = '$franchise_id'
                                   AND t.transaction_vendor_id = '$vendor_id'
                                   AND t.is_deleted = '1'
                                 ORDER BY t.transaction_date DESC, t.transaction_id DESC");

            $rows   = [];
            $credit = 0;
            $debit  = 0;
            while ($row = mysqli_fetch_assoc($r)) {
                if ($row['transaction_type'] == TXN_DEBIT) {
                    $debit += floatval($row['transaction_amount']);
                } else {
                    $credit += floatval($row['transaction_amount']);
                }
                $rows[] = $row;
            }

            http_response_code(200);
            $response = [
                'status'             => 'success',
                'message'            => 'Vendor transactions fetched successfully',
                'data'               => $rows,
                'total'              => count($rows),
                'vendor_name'        => $vendor['vendor_name'],
                'vendor_outstanding' => money($vendor['vendor_wallet']),
                'summary'            => [
                    'total_credit' => money($credit),
                    'total_debit'  => money($debit),
                ],
            ];
        } catch (Throwable $e) {
            $response = errorResponse($sql, $e, 'Failed to fetch transactions');
        }
        break;
    }

    // ----- 3. Vendor bills with paid / pending -----
    case 3: {
        try {
            assertScope($company_id, $franchise_id);
            if ($vendor_id <= 0) {
                throw new ApiException('Vendor ID is required');
            }

            $cond = paymentCondition('t');
            $r = runQuery($sql, "SELECT p.purchess_id, p.purchess_bill_number, p.purchess_date,
                                        p.purches_total_with_gst_amount, p.purchess_return_total_amount,
                                        COALESCE(pay.paid, 0) AS paid
                                 FROM tbl_purchess AS p
                                 LEFT JOIN (
                                     SELECT t.transaction_purches_id, SUM(t.transaction_amount) AS paid
                                     FROM tbl_transaction AS t
                                     WHERE t.company_id = '$company_id'
                                       AND t.transaction_vendor_id = '$vendor_id'
                                       AND t.transaction_purches_id > 0
                                       AND t.is_deleted = '1'
                                       AND $cond
                                     GROUP BY t.transaction_purches_id
                                 ) AS pay ON pay.transaction_purches_id = p.purchess_id
                                 WHERE p.company_id = '$company_id'
                                   AND p.franchise_id = '$franchise_id'
                                   AND p.purchess_vendor_id = '$vendor_id'
                                   AND p.is_deleted = '1'
                                 ORDER BY p.purchess_date DESC, p.purchess_id DESC");

            $bills         = [];
            $pending_total = 0;
            $open_count    = 0;
            while ($row = mysqli_fetch_assoc($r)) {
                $s = billSummary($row);
                if ($s['pending'] > 0) {
                    $pending_total += $s['pending'];
                    $open_count++;
                }
                $bills[] = array_merge([
                    'purchess_id'          => $row['purchess_id'],
                    'purchess_bill_number' => $row['purchess_bill_number'],
                    'purchess_date'        => $row['purchess_date'],
                ], $s);
            }

            http_response_code(200);
            $response = [
                'status'  => 'success',
                'message' => 'Vendor bills fetched successfully',
                'data'    => $bills,
                'total'   => count($bills),
                'summary' => [
                    'pending_total' => money($pending_total),
                    'open_bills'    => $open_count,
                ],
            ];
        } catch (Throwable $e) {
            $response = errorResponse($sql, $e, 'Failed to fetch bills');
        }
        break;
    }

    // ----- 4. Delete payment (reverse outstanding + account balance) -----
    case 4: {
        try {
            assertScope($company_id, $franchise_id);
            if ($transaction_id <= 0) {
                throw new ApiException('Transaction ID is required');
            }

            mysqli_begin_transaction($sql);

            $txn = getPaymentTransaction($sql, $company_id, $franchise_id, $transaction_id, true);
            if (!$txn) {
                throw new ApiException('Payment not found or already deleted', 404);
            }
            $txn_vendor_id = intval($txn['transaction_vendor_id']);
            $amt           = money($txn['transaction_amount']);

            getVendor($sql, $company_id, $txn_vendor_id, true); // lock vendor row

            $vendor_balance  = adjustVendorOutstanding($sql, $company_id, $txn_vendor_id, $amt);
            $account_balance = adjustAccountBalance($sql, $company_id, $txn['transaction_account_id'], $amt);

            runQuery($sql, "UPDATE tbl_transaction
                            SET is_deleted = '0'
                            WHERE transaction_id = '$transaction_id'
                              AND company_id = '$company_id'
                              AND franchise_id = '$franchise_id'");

            // Later rows no longer include this payment
            shiftVendorBalances($sql, $company_id, $txn_vendor_id, $transaction_id + 1, $amt);

            mysqli_commit($sql);

            logMessage('purchase_payment',
                "Payment deleted (ID: $transaction_id): amount $amt reversed, outstanding $vendor_balance, by employee $employee_id",
                'INFO');
            http_response_code(200);
            $response = [
                'status'             => 'success',
                'message'            => 'Payment deleted successfully',
                'vendor_outstanding' => $vendor_balance,
                'account_id'         => intval($txn['transaction_account_id']),
                'account_balance'    => $account_balance,
            ];
        } catch (Throwable $e) {
            $response = errorResponse($sql, $e, 'Failed to delete payment');
        }
        break;
    }

    // ----- 5. Account list with balance -----
    case 5: {
        try {
            assertScope($company_id, $franchise_id);

            $r = runQuery($sql, "SELECT account_id, account_name, account_type,
                                        account_number, account_balance
                                 FROM tbl_account
                                 WHERE company_id = '$company_id'
                                   AND franchise_id = '$franchise_id'
                                   AND is_deleted = '1'
                                 ORDER BY account_name ASC");
            $accounts = [];
            while ($row = mysqli_fetch_assoc($r)) {
                $accounts[] = $row;
            }

            http_response_code(200);
            $response = [
                'status'  => 'success',
                'message' => 'Accounts fetched successfully',
                'data'    => $accounts,
                'total'   => count($accounts),
            ];
        } catch (Throwable $e) {
            $response = errorResponse($sql, $e, 'Failed to fetch accounts');
        }
        break;
    }

    // ----- 6. Edit payment -----
    case 6: {
        try {
            assertScope($company_id, $franchise_id);
            if ($transaction_id <= 0) {
                throw new ApiException('Transaction ID is required');
            }
            validatePaymentFields($account_id, $transfer_type, $amount, $transaction_date);

            mysqli_begin_transaction($sql);

            $txn = getPaymentTransaction($sql, $company_id, $franchise_id, $transaction_id, true);
            if (!$txn) {
                throw new ApiException('Payment not found or already deleted', 404);
            }

            $txn_vendor_id  = intval($txn['transaction_vendor_id']);
            $old_account_id = intval($txn['transaction_account_id']);
            $old_amount     = money($txn['transaction_amount']);
            $purchase_id    = intval($txn['transaction_purches_id']);

            $vendor = getVendor($sql, $company_id, $txn_vendor_id, true);
            if (!$vendor) {
                throw new ApiException('The vendor of this payment was not found', 404);
            }
            if (!getAccount($sql, $company_id, $franchise_id, $account_id)) {
                throw new ApiException('Selected account was not found', 404);
            }

            // Payment against a bill: can't pay more than the bill's pending + this row's old amount
            $bill    = null;
            $max_pay = null;
            if ($purchase_id > 0) {
                $bill = getBillDue($sql, $company_id, $franchise_id, $purchase_id, $txn_vendor_id);
                if ($bill) {
                    $max_pay = money($bill['pending'] + $old_amount);
                    if ($amount > $max_pay + 0.01) {
                        throw new ApiException(
                            "Bill {$bill['bill_number']} allows at most $max_pay for this payment. Enter that amount or less.",
                            409
                        );
                    }
                }
            }

            $delta = money($amount - $old_amount); // + paying more, - paying less

            $vendor_balance = adjustVendorOutstanding($sql, $company_id, $txn_vendor_id, -$delta);

            $old_account_balance = null;
            if ($old_account_id === $account_id) {
                $account_balance = adjustAccountBalance($sql, $company_id, $account_id, -$delta);
            } else {
                // Money goes back to the old account, new account pays the full amount
                $old_account_balance = adjustAccountBalance($sql, $company_id, $old_account_id, $old_amount);
                $account_balance     = adjustAccountBalance($sql, $company_id, $account_id, -$amount);
            }

            $row_remark = $remark !== ''
                ? $remark
                : mysqli_real_escape_string($sql, autoRemark(
                    $vendor['vendor_name'],
                    $bill ? $bill['bill_number'] : null,
                    $max_pay !== null && $amount < $max_pay
                ));
            $number_value = $transaction_number !== '' ? "'$transaction_number'" : 'NULL';
            $date_esc     = mysqli_real_escape_string($sql, $transaction_date);

            runQuery($sql, "UPDATE tbl_transaction
                            SET transaction_amount        = '" . sqlMoney($amount) . "',
                                transaction_account_id    = '$account_id',
                                transaction_transfer_type = '$transfer_type',
                                transaction_number        = $number_value,
                                transaction_date          = '$date_esc',
                                transaction_remark        = '$row_remark'
                            WHERE transaction_id = '$transaction_id'
                              AND company_id = '$company_id'
                              AND franchise_id = '$franchise_id'");

            // This row and every later row of the vendor move by the difference
            shiftVendorBalances($sql, $company_id, $txn_vendor_id, $transaction_id, -$delta);

            mysqli_commit($sql);

            logMessage('purchase_payment',
                "Payment edited (ID: $transaction_id): amount $old_amount -> $amount, account $old_account_id -> $account_id, "
                . "outstanding $vendor_balance, by employee $employee_id",
                'INFO');
            http_response_code(200);
            $response = [
                'status'              => 'success',
                'message'             => 'Payment updated successfully',
                'transaction_id'      => $transaction_id,
                'difference'          => $delta,
                'vendor_outstanding'  => $vendor_balance,
                'account_id'          => $account_id,
                'account_balance'     => $account_balance,
                'old_account_id'      => $old_account_id !== $account_id ? $old_account_id : null,
                'old_account_balance' => $old_account_balance,
            ];
        } catch (Throwable $e) {
            $response = errorResponse($sql, $e, 'Failed to update payment');
        }
        break;
    }

    default:
        http_response_code(400);
        $response = ['status' => 'error', 'message' => 'Invalid request type'];
        logError('purchase_payment', "Invalid request type: $type");
}

logResponse('purchase_payment', $response);
echo json_encode($response);
mysqli_close($sql);
?>