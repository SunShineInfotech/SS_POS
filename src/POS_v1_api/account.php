<?php
require_once 'dbconnection.php';

if (isset($GLOBALS['_RAW_INPUT'])) {
    $postData = json_decode($GLOBALS['_RAW_INPUT'], true);
} else {
    $postData = json_decode(file_get_contents('php://input'), true);
}

logRequest('account', $postData);

if (empty($postData)) {
    http_response_code(400);
    $response = ['status' => 'error', 'message' => 'No data received'];
    logResponse('account', $response);
    echo json_encode($response);
    exit;
}

$type               = isset($postData['type']) ? intval($postData['type']) : 0;
$company_id         = isset($postData['company_id']) ? mysqli_real_escape_string($sql, trim($postData['company_id'])) : '';
$franchise_id       = isset($postData['franchise_id']) ? mysqli_real_escape_string($sql, trim($postData['franchise_id'])) : '';
$financial_year_id  = isset($postData['financial_year_id']) ? intval($postData['financial_year_id']) : 0;
$account_id         = isset($postData['account_id']) ? intval($postData['account_id']) : 0;
$account_name       = isset($postData['account_name']) ? mysqli_real_escape_string($sql, trim($postData['account_name'])) : '';
$account_type       = isset($postData['account_type']) ? intval($postData['account_type']) : 1;
$account_ifsc       = isset($postData['account_ifsc']) ? mysqli_real_escape_string($sql, trim($postData['account_ifsc'])) : '';
$account_number     = isset($postData['account_number']) ? mysqli_real_escape_string($sql, trim($postData['account_number'])) : '';
$account_branch_name= isset($postData['account_branch_name']) ? mysqli_real_escape_string($sql, trim($postData['account_branch_name'])) : '';
$account_holder_name= isset($postData['account_holder_name']) ? mysqli_real_escape_string($sql, trim($postData['account_holder_name'])) : '';
$account_balance    = isset($postData['opening_balance']) ? floatval($postData['opening_balance']) : 0;
$account_gst_number = isset($postData['account_gst_number']) ? mysqli_real_escape_string($sql, trim($postData['account_gst_number'])) : '';

$response = ['status' => 'error', 'message' => 'Invalid request'];
http_response_code(400);

switch ($type) {

    // 1. Insert (with opening balance transaction)
    case 1: {
        if (empty($company_id) || empty($franchise_id) || empty($account_name) || empty($financial_year_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company, franchise, account name and financial year are required'];
            break;
        }

        // Duplicate check
        $check = "SELECT account_id FROM tbl_account
                  WHERE company_id = '$company_id' AND franchise_id = '$franchise_id'
                    AND account_name = '$account_name' AND is_deleted = 1";
        $checkResult = mysqli_query($sql, $check);
        if (!$checkResult) {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Duplicate check failed: ' . mysqli_error($sql)];
            break;
        }
        if (mysqli_num_rows($checkResult) > 0) {
            http_response_code(409);
            $response = ['status' => 'error', 'message' => 'Account with this name already exists'];
            break;
        }

        // Insert account
        $query = "INSERT INTO tbl_account
                  (company_id, franchise_id, account_name, account_type, account_ifsc,
                   account_number, account_branch_name, account_holder_name,
                   account_balance, account_gst_number, is_deleted, c_date)
                  VALUES ('$company_id', '$franchise_id', '$account_name', $account_type,
                          '$account_ifsc', '$account_number', '$account_branch_name',
                          '$account_holder_name', $account_balance, '$account_gst_number', 1, NOW())";
        if (mysqli_query($sql, $query)) {
            $newId = mysqli_insert_id($sql);

            // Insert opening balance transaction if amount > 0
            if ($account_balance > 0) {
                $transaction_query = "INSERT INTO tbl_transaction
                                      (company_id, franchise_id, transaction_financial_year_id,
                                       transaction_account_id, transaction_amount, transaction_type,
                                       transaction_date, transaction_balance, transaction_remark,
                                       is_deleted, c_date)
                                      VALUES ('$company_id', '$franchise_id', $financial_year_id,
                                              $newId, $account_balance, 1,
                                              CURDATE(), $account_balance, 'Opening Balance',
                                              1, NOW())";
                if (!mysqli_query($sql, $transaction_query)) {
                    // Log error but don't rollback – account is created, but we log it
                    logError('account', 'Failed to insert opening balance transaction: ' . mysqli_error($sql));
                }
            }

            logMessage('account', "New account: $account_name (ID: $newId) with opening balance $account_balance", 'INFO');
            http_response_code(201);
            $response = [
                'status' => 'success',
                'message' => 'Account added',
                'account_id' => $newId
            ];
        } else {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to add account: ' . mysqli_error($sql)];
        }
        break;
    }

    // 2. List (unchanged)
    case 2: {
        if (empty($company_id) || empty($franchise_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company and franchise IDs required'];
            break;
        }

        $query = "SELECT account_id, company_id, franchise_id, account_name, account_type,
                         account_ifsc, account_number, account_branch_name, account_holder_name,
                         account_balance, account_gst_number, is_deleted, c_date, u_date
                  FROM tbl_account
                  WHERE company_id = '$company_id' AND franchise_id = '$franchise_id' AND is_deleted = 1
                  ORDER BY account_name ASC";
        $result = mysqli_query($sql, $query);
        if ($result) {
            $accounts = [];
            while ($row = mysqli_fetch_assoc($result)) {
                $accounts[] = $row;
            }
            http_response_code(200);
            $response = [
                'status' => 'success',
                'message' => 'Accounts fetched',
                'data' => $accounts,
                'total' => count($accounts)
            ];
        } else {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to fetch accounts: ' . mysqli_error($sql)];
        }
        break;
    }

    // 3. Update (no balance change)
    case 3: {
        if (empty($account_id) || empty($company_id) || empty($franchise_id) || empty($account_name)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'All fields required'];
            break;
        }

        // Duplicate check (exclude current)
        $check = "SELECT account_id FROM tbl_account
                  WHERE company_id = '$company_id' AND franchise_id = '$franchise_id'
                    AND account_name = '$account_name' AND is_deleted = 1
                    AND account_id != $account_id";
        $checkResult = mysqli_query($sql, $check);
        if (!$checkResult) {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Duplicate check failed: ' . mysqli_error($sql)];
            break;
        }
        if (mysqli_num_rows($checkResult) > 0) {
            http_response_code(409);
            $response = ['status' => 'error', 'message' => 'Account with this name already exists'];
            break;
        }

        // Update (do not change balance here)
        $query = "UPDATE tbl_account
                  SET account_name = '$account_name',
                      account_type = $account_type,
                      account_ifsc = '$account_ifsc',
                      account_number = '$account_number',
                      account_branch_name = '$account_branch_name',
                      account_holder_name = '$account_holder_name',
                      account_gst_number = '$account_gst_number',
                      u_date = NOW()
                  WHERE account_id = $account_id
                    AND company_id = '$company_id'
                    AND franchise_id = '$franchise_id'
                    AND is_deleted = 1";
        if (mysqli_query($sql, $query)) {
            $affected = mysqli_affected_rows($sql);
            if ($affected === 0) {
                $exists = mysqli_query($sql, "SELECT account_id FROM tbl_account
                                              WHERE account_id = $account_id
                                                AND company_id = '$company_id'
                                                AND franchise_id = '$franchise_id'
                                                AND is_deleted = 1");
                if ($exists && mysqli_num_rows($exists) > 0) {
                    http_response_code(200);
                    $response = ['status' => 'success', 'message' => 'No changes to save'];
                } else {
                    http_response_code(404);
                    $response = ['status' => 'error', 'message' => 'Account not found'];
                }
            } else {
                logMessage('account', "Account updated: $account_name (ID: $account_id)", 'INFO');
                http_response_code(200);
                $response = ['status' => 'success', 'message' => 'Account updated'];
            }
        } else {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Update failed: ' . mysqli_error($sql)];
        }
        break;
    }

    // 4. Soft delete (unchanged)
    case 4: {
        if (empty($account_id) || empty($company_id) || empty($franchise_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Missing parameters'];
            break;
        }

        $query = "UPDATE tbl_account SET is_deleted = 0
                  WHERE account_id = $account_id
                    AND company_id = '$company_id'
                    AND franchise_id = '$franchise_id'";
        if (mysqli_query($sql, $query)) {
            if (mysqli_affected_rows($sql) === 0) {
                http_response_code(404);
                $response = ['status' => 'error', 'message' => 'Account not found'];
            } else {
                logMessage('account', "Account deleted (ID: $account_id)", 'INFO');
                http_response_code(200);
                $response = ['status' => 'success', 'message' => 'Account deleted'];
            }
        } else {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Delete failed: ' . mysqli_error($sql)];
        }
        break;
    }

    // 5. Get single (unchanged)
    case 5: {
        if (empty($account_id) || empty($company_id) || empty($franchise_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Missing parameters'];
            break;
        }

        $query = "SELECT account_id, company_id, franchise_id, account_name, account_type,
                         account_ifsc, account_number, account_branch_name, account_holder_name,
                         account_balance, account_gst_number, is_deleted, c_date, u_date
                  FROM tbl_account
                  WHERE account_id = $account_id
                    AND company_id = '$company_id'
                    AND franchise_id = '$franchise_id'
                    AND is_deleted = 1";
        $result = mysqli_query($sql, $query);
        if ($result && mysqli_num_rows($result) > 0) {
            $row = mysqli_fetch_assoc($result);
            http_response_code(200);
            $response = ['status' => 'success', 'data' => $row];
        } elseif (!$result) {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Fetch failed: ' . mysqli_error($sql)];
        } else {
            http_response_code(404);
            $response = ['status' => 'error', 'message' => 'Account not found'];
        }
        break;
    }

    default:
        http_response_code(400);
        $response = ['status' => 'error', 'message' => 'Invalid type'];
        logError('account', "Invalid type: $type");
}

logResponse('account', $response);
echo json_encode($response);
mysqli_close($sql);