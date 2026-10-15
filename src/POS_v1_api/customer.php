<?php
// v1_api/customer.php
require_once 'dbconnection.php';

/*
 * ------------------------------------------------------------------
 *  tbl_customer API
 *  type: 1 = insert, 2 = list, 3 = update, 4 = soft delete,
 *        5 = find by mobile (POS lookup), 6 = get single by id,
 *        7 = restore soft-deleted
 *
 *  Required columns (already used by sell.php):
 *    customer_id, company_id, customer_name, customer_mobile, is_deleted, c_date
 *
 *  Optional columns are DETECTED automatically — if a column is missing the
 *  field is simply skipped (no "Unknown column" errors). Accepted names:
 *    franchise_id
 *    customer_email      | customer_email_id | email
 *    customer_state_id   | customer_state    | state_id
 *    customer_city       | customer_city_name| city
 *    customer_address    | address
 *    customer_pincode    | customer_pin_code | customer_pin | pincode
 *    customer_wallet_balance | customer_wallet | wallet_balance
 *    u_date
 *
 *  To store the POS popup fields, add whichever are missing (run once):
 *    ALTER TABLE tbl_customer ADD COLUMN customer_email VARCHAR(150) NULL;
 *    ALTER TABLE tbl_customer ADD COLUMN customer_state_id INT NULL;
 *    ALTER TABLE tbl_customer ADD COLUMN customer_city VARCHAR(100) NULL;
 *    ALTER TABLE tbl_customer ADD COLUMN customer_address TEXT NULL;
 *    ALTER TABLE tbl_customer ADD COLUMN customer_pincode VARCHAR(10) NULL;
 *    ALTER TABLE tbl_customer ADD COLUMN customer_wallet_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00;
 *    ALTER TABLE tbl_customer ADD COLUMN u_date DATETIME NULL;
 * ------------------------------------------------------------------
 */

if (isset($GLOBALS['_RAW_INPUT'])) {
    $postData = json_decode($GLOBALS['_RAW_INPUT'], true);
} else {
    $postData = json_decode(file_get_contents('php://input'), true);
}

logRequest('customer', $postData);

if (empty($postData)) {
    http_response_code(400);
    $response = ['status' => 'error', 'message' => 'No data received'];
    logResponse('customer', $response);
    echo json_encode($response);
    exit;
}

$type = isset($postData['type']) ? intval($postData['type']) : 0;

// ----- Escape / normalize input -----
$company_id   = isset($postData['company_id']) ? mysqli_real_escape_string($sql, trim($postData['company_id'])) : '';
$franchise_id = isset($postData['franchise_id']) ? mysqli_real_escape_string($sql, trim($postData['franchise_id'])) : '';
$customer_id  = isset($postData['customer_id']) ? intval($postData['customer_id']) : 0;

$raw_mobile      = isset($postData['customer_mobile']) ? preg_replace('/\D/', '', (string)$postData['customer_mobile']) : '';
$customer_mobile = mysqli_real_escape_string($sql, $raw_mobile);
$customer_name   = isset($postData['customer_name']) ? mysqli_real_escape_string($sql, trim($postData['customer_name'])) : '';
$customer_email  = isset($postData['customer_email']) ? mysqli_real_escape_string($sql, trim($postData['customer_email'])) : '';
$customer_state  = (isset($postData['customer_state_id']) && $postData['customer_state_id'] !== '') ? intval($postData['customer_state_id']) : 0;
$customer_city   = isset($postData['customer_city']) ? mysqli_real_escape_string($sql, trim($postData['customer_city'])) : '';
$customer_addr   = isset($postData['customer_address']) ? mysqli_real_escape_string($sql, trim($postData['customer_address'])) : '';
$raw_pincode     = isset($postData['customer_pincode']) ? preg_replace('/\D/', '', (string)$postData['customer_pincode']) : '';
$customer_pin    = mysqli_real_escape_string($sql, $raw_pincode);
$wallet_balance  = isset($postData['customer_wallet_balance']) ? floatval($postData['customer_wallet_balance']) : 0;

$response = ['status' => 'error', 'message' => 'Invalid request'];
http_response_code(400);

/* ------------------------------------------------------------------
 *  Column detection
 * ------------------------------------------------------------------ */

// field name (lowercase) => ['name' => actual name, 'nullable' => bool]
function getCustomerColumns($sql) {
    $cols = [];
    $res = mysqli_query($sql, "SHOW COLUMNS FROM tbl_customer");
    if ($res) {
        while ($r = mysqli_fetch_assoc($res)) {
            $cols[strtolower($r['Field'])] = [
                'name'     => $r['Field'],
                'nullable' => strtoupper($r['Null']) === 'YES'
            ];
        }
    }
    return $cols;
}

function pickColumn($cols, $candidates) {
    foreach ($candidates as $c) {
        if (isset($cols[strtolower($c)])) {
            return $cols[strtolower($c)];
        }
    }
    return null;
}

$columns = getCustomerColumns($sql);

// key => detected column meta (or null when the table doesn't have it)
$COL = [
    'franchise' => pickColumn($columns, ['franchise_id']),
    'email'     => pickColumn($columns, ['customer_email', 'customer_email_id', 'email']),
    'state'     => pickColumn($columns, ['customer_state_id', 'customer_state', 'state_id']),
    'city'      => pickColumn($columns, ['customer_city', 'customer_city_name', 'city']),
    'address'   => pickColumn($columns, ['customer_address', 'address']),
    'pincode'   => pickColumn($columns, ['customer_pincode', 'customer_pin_code', 'customer_pin', 'pincode']),
    'wallet'    => pickColumn($columns, ['customer_wallet_balance', 'customer_wallet', 'wallet_balance']),
];
$U_DATE = pickColumn($columns, ['u_date']);

// Alias each optional column to the name the frontend expects
$ALIAS = [
    'franchise' => 'franchise_id',
    'email'     => 'customer_email',
    'state'     => 'customer_state_id',
    'city'      => 'customer_city',
    'address'   => 'customer_address',
    'pincode'   => 'customer_pincode',
    'wallet'    => 'customer_wallet_balance',
];

// Empty id → NULL when the column allows it, else 0
function idOrEmpty($id, $meta) {
    if ($id !== '' && $id !== 0 && $id !== '0') {
        return "'" . $id . "'";
    }
    return ($meta && !$meta['nullable']) ? "'0'" : 'NULL';
}

// SQL value for each optional field (only used when the column exists)
$VALUES = [
    'franchise' => idOrEmpty($franchise_id, $COL['franchise']),
    'email'     => "'$customer_email'",
    'state'     => idOrEmpty($customer_state, $COL['state']),
    'city'      => "'$customer_city'",
    'address'   => "'$customer_addr'",
    'pincode'   => "'$customer_pin'",
    'wallet'    => "'$wallet_balance'",
];

// Fields the client sent a value for but the table has no column for
function skippedFields($COL, $postData) {
    $map = [
        'email'   => 'customer_email',
        'state'   => 'customer_state_id',
        'city'    => 'customer_city',
        'address' => 'customer_address',
        'pincode' => 'customer_pincode',
        'wallet'  => 'customer_wallet_balance',
    ];
    $skipped = [];
    foreach ($map as $key => $field) {
        if (!$COL[$key] && isset($postData[$field]) && $postData[$field] !== '' && $postData[$field] !== 0) {
            $skipped[] = $field;
        }
    }
    return $skipped;
}

// Common SELECT list + state join, built from detected columns
$selectParts = [
    'c.customer_id', 'c.company_id', 'c.customer_name',
    'c.customer_mobile', 'c.is_deleted', 'c.c_date'
];
foreach ($ALIAS as $key => $alias) {
    $selectParts[] = $COL[$key] ? "c.`{$COL[$key]['name']}` AS $alias" : "NULL AS $alias";
}
$selectParts[] = $COL['state'] ? 's.state_name' : 'NULL AS state_name';
$selectColumns = implode(', ', $selectParts);
$stateJoin = $COL['state']
    ? "LEFT JOIN tbl_state AS s ON s.state_id = c.`{$COL['state']['name']}`"
    : '';

$uDateSet = $U_DATE ? ", `{$U_DATE['name']}` = NOW()" : '';

// ----- Shared validation for insert / update -----
function validateCustomer($mobile, $email, $pincode) {
    if (strlen($mobile) !== 10) {
        return 'Enter a valid 10 digit mobile number';
    }
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return 'Enter a valid email address';
    }
    if ($pincode !== '' && strlen($pincode) !== 6) {
        return 'Pincode must be 6 digits';
    }
    return '';
}

switch ($type) {

    // ----- 1. Insert new customer -----
    case 1: {
        if (empty($company_id)) {
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }
        $error = validateCustomer($raw_mobile, $customer_email, $raw_pincode);
        if ($error !== '') {
            $response = ['status' => 'error', 'message' => $error];
            break;
        }

        // Same mobile already registered for this company → return that record
        $checkQuery = "SELECT customer_id FROM tbl_customer
                       WHERE company_id = '$company_id'
                         AND customer_mobile = '$customer_mobile'
                         AND is_deleted = '1'
                       LIMIT 1";
        $checkResult = mysqli_query($sql, $checkQuery);
        if ($checkResult && mysqli_num_rows($checkResult) > 0) {
            $existing = mysqli_fetch_assoc($checkResult);
            http_response_code(409);
            $response = [
                'status' => 'error',
                'message' => 'A customer with this mobile number already exists',
                'customer_id' => intval($existing['customer_id'])
            ];
            break;
        }

        $safeName = $customer_name !== '' ? $customer_name : 'Walk-in';

        $insertCols = ['company_id', 'customer_name', 'customer_mobile', 'is_deleted', 'c_date'];
        $insertVals = ["'$company_id'", "'$safeName'", "'$customer_mobile'", "'1'", 'NOW()'];
        foreach ($VALUES as $key => $value) {
            if ($COL[$key]) {
                $insertCols[] = "`{$COL[$key]['name']}`";
                $insertVals[] = $value;
            }
        }

        $query = "INSERT INTO tbl_customer (" . implode(', ', $insertCols) . ")
                  VALUES (" . implode(', ', $insertVals) . ")";

        if (mysqli_query($sql, $query)) {
            $new_id  = mysqli_insert_id($sql);
            $skipped = skippedFields($COL, $postData);
            logMessage('customer', "New customer added: $safeName / $customer_mobile (ID: $new_id)", 'INFO');
            if ($skipped) {
                logMessage('customer', 'Columns missing, not saved: ' . implode(', ', $skipped), 'WARNING');
            }
            http_response_code(201);
            $response = [
                'status' => 'success',
                'message' => 'Customer added successfully',
                'customer_id' => $new_id,
                'skipped_fields' => $skipped
            ];
        } else {
            $error = mysqli_error($sql);
            logError('customer', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to add customer: ' . $error];
        }
        break;
    }

    // ----- 2. List customers (active + soft-deleted, UI filters) -----
    case 2: {
        if (empty($company_id)) {
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }

        $query = "SELECT $selectColumns
                  FROM tbl_customer AS c
                  $stateJoin
                  WHERE c.company_id = '$company_id'
                  ORDER BY c.customer_id DESC";
        $result = mysqli_query($sql, $query);

        if ($result) {
            $customers = [];
            while ($row = mysqli_fetch_assoc($result)) {
                $customers[] = $row;
            }
            logMessage('customer', "Fetched " . count($customers) . " customers", 'INFO');
            http_response_code(200);
            $response = [
                'status' => 'success',
                'message' => 'Customers fetched successfully',
                'data' => $customers,
                'total' => count($customers)
            ];
        } else {
            $error = mysqli_error($sql);
            logError('customer', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to fetch customers: ' . $error];
        }
        break;
    }

    // ----- 3. Update customer -----
    case 3: {
        if (empty($customer_id)) {
            $response = ['status' => 'error', 'message' => 'Customer ID is required'];
            break;
        }
        if (empty($company_id)) {
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }
        $error = validateCustomer($raw_mobile, $customer_email, $raw_pincode);
        if ($error !== '') {
            $response = ['status' => 'error', 'message' => $error];
            break;
        }

        // Mobile must stay unique inside the company
        $checkQuery = "SELECT customer_id FROM tbl_customer
                       WHERE company_id = '$company_id'
                         AND customer_mobile = '$customer_mobile'
                         AND is_deleted = '1'
                         AND customer_id != '$customer_id'
                       LIMIT 1";
        $checkResult = mysqli_query($sql, $checkQuery);
        if ($checkResult && mysqli_num_rows($checkResult) > 0) {
            http_response_code(409);
            $response = ['status' => 'error', 'message' => 'Another customer already uses this mobile number'];
            break;
        }

        $safeName = $customer_name !== '' ? $customer_name : 'Walk-in';

        $sets = ["customer_name = '$safeName'", "customer_mobile = '$customer_mobile'"];
        foreach ($VALUES as $key => $value) {
            // franchise_id is set once on insert, never moved by an update
            if ($key !== 'franchise' && $COL[$key]) {
                $sets[] = "`{$COL[$key]['name']}` = $value";
            }
        }

        $query = "UPDATE tbl_customer SET " . implode(', ', $sets) . " $uDateSet
                  WHERE customer_id = '$customer_id'
                    AND company_id = '$company_id'
                    AND is_deleted = '1'";

        if (mysqli_query($sql, $query)) {
            logMessage('customer', "Customer updated: $safeName (ID: $customer_id)", 'INFO');
            http_response_code(200);
            $response = [
                'status' => 'success',
                'message' => 'Customer updated successfully',
                'customer_id' => $customer_id,
                'skipped_fields' => skippedFields($COL, $postData)
            ];
        } else {
            $error = mysqli_error($sql);
            logError('customer', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to update customer: ' . $error];
        }
        break;
    }

    // ----- 4. Soft delete customer -----
    case 4: {
        if (empty($customer_id)) {
            $response = ['status' => 'error', 'message' => 'Customer ID is required'];
            break;
        }
        if (empty($company_id)) {
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }

        $query = "UPDATE tbl_customer
                  SET is_deleted = '0' $uDateSet
                  WHERE customer_id = '$customer_id'
                    AND company_id = '$company_id'";

        if (mysqli_query($sql, $query)) {
            if (mysqli_affected_rows($sql) === 0) {
                http_response_code(404);
                $response = ['status' => 'error', 'message' => 'Customer not found'];
            } else {
                logMessage('customer', "Customer deleted (ID: $customer_id)", 'INFO');
                http_response_code(200);
                $response = ['status' => 'success', 'message' => 'Customer deleted successfully'];
            }
        } else {
            $error = mysqli_error($sql);
            logError('customer', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to delete customer: ' . $error];
        }
        break;
    }

    // ----- 5. Find customer by mobile (POS lookup) -----
    // Returns status 'success' with data = null when not registered,
    // so the POS can treat it as a "new customer" without an error toast.
    case 5: {
        if (empty($company_id)) {
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }
        if (strlen($raw_mobile) !== 10) {
            $response = ['status' => 'error', 'message' => 'Enter a valid 10 digit mobile number'];
            break;
        }

        $query = "SELECT $selectColumns
                  FROM tbl_customer AS c
                  $stateJoin
                  WHERE c.company_id = '$company_id'
                    AND c.customer_mobile = '$customer_mobile'
                    AND c.is_deleted = '1'
                  ORDER BY c.customer_id DESC
                  LIMIT 1";
        $result = mysqli_query($sql, $query);

        if ($result) {
            $row = mysqli_fetch_assoc($result);
            http_response_code(200);
            $response = [
                'status' => 'success',
                'message' => $row ? 'Customer found' : 'Customer not registered',
                'found' => (bool)$row,
                'data' => $row ?: null
            ];
        } else {
            $error = mysqli_error($sql);
            logError('customer', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to search customer: ' . $error];
        }
        break;
    }

    // ----- 6. Get single customer by ID -----
    case 6: {
        if (empty($customer_id)) {
            $response = ['status' => 'error', 'message' => 'Customer ID is required'];
            break;
        }
        if (empty($company_id)) {
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }

        $query = "SELECT $selectColumns
                  FROM tbl_customer AS c
                  $stateJoin
                  WHERE c.customer_id = '$customer_id'
                    AND c.company_id = '$company_id'
                    AND c.is_deleted = '1'";
        $result = mysqli_query($sql, $query);

        if ($result && mysqli_num_rows($result) > 0) {
            http_response_code(200);
            $response = [
                'status' => 'success',
                'message' => 'Customer fetched successfully',
                'data' => mysqli_fetch_assoc($result)
            ];
        } else {
            http_response_code(404);
            $response = ['status' => 'error', 'message' => 'Customer not found'];
        }
        break;
    }

    // ----- 7. Restore soft-deleted customer -----
    case 7: {
        if (empty($customer_id)) {
            $response = ['status' => 'error', 'message' => 'Customer ID is required'];
            break;
        }
        if (empty($company_id)) {
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }

        $query = "UPDATE tbl_customer
                  SET is_deleted = '1' $uDateSet
                  WHERE customer_id = '$customer_id'
                    AND company_id = '$company_id'";

        if (mysqli_query($sql, $query)) {
            if (mysqli_affected_rows($sql) === 0) {
                http_response_code(404);
                $response = ['status' => 'error', 'message' => 'Customer not found'];
            } else {
                logMessage('customer', "Customer restored (ID: $customer_id)", 'INFO');
                http_response_code(200);
                $response = ['status' => 'success', 'message' => 'Customer restored successfully'];
            }
        } else {
            $error = mysqli_error($sql);
            logError('customer', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to restore customer: ' . $error];
        }
        break;
    }

    default:
        http_response_code(400);
        $response = ['status' => 'error', 'message' => 'Invalid request type'];
        logError('customer', "Invalid request type: $type");
}

logResponse('customer', $response);
echo json_encode($response);
mysqli_close($sql);
?>