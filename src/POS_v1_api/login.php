<?php
// v1_api/login.php

require_once 'dbconnection.php';

header('Content-Type: application/json');

// ----- Get POST data -----
// dbconnection.php already reads + json_decodes + sanitizes php://input once
// and stores it in $GLOBALS['_RAW_INPUT']. Re-reading php://input here is
// unreliable (the stream may already be exhausted on some PHP/SAPI setups),
// so we reuse what dbconnection.php already parsed.
if (isset($GLOBALS['_RAW_INPUT'])) {
    $postData = json_decode($GLOBALS['_RAW_INPUT'], true);
} else {
    // Fallback (e.g. dbconnection.php's raw-input block didn't run)
    $postData = json_decode(file_get_contents('php://input'), true);
}

logRequest('login', $postData);

if (empty($postData)) {
    http_response_code(400);
    $response = ['status' => 'error', 'message' => 'No data received'];
    logResponse('login', $response);
    echo json_encode($response);
    exit;
}

$type = isset($postData['type']) ? intval($postData['type']) : 0;

/* ============================================
   DB HELPER: run a prepared statement safely
   ============================================ */
function runPrepared($conn, $sql, $types, $params, $apiName = 'login') {
    $stmt = mysqli_prepare($conn, $sql);
    if ($stmt === false) {
        logError($apiName, 'Prepare failed: ' . mysqli_error($conn), mysqli_errno($conn));
        return false;
    }
    if ($types !== '' && !empty($params)) {
        mysqli_stmt_bind_param($stmt, $types, ...$params);
    }
    if (!mysqli_stmt_execute($stmt)) {
        logError($apiName, 'Execute failed: ' . mysqli_stmt_error($stmt), mysqli_stmt_errno($stmt));
        mysqli_stmt_close($stmt);
        return false;
    }
    $result = mysqli_stmt_get_result($stmt);
    mysqli_stmt_close($stmt);
    return $result; // mysqli_result on success, false on failure
}

// ----- Helper: Verify franchise (case-insensitive) -----
function verifyFranchise($conn, $code) {
    $code = strtoupper(trim($code));
    $query = "SELECT * FROM `tbl_franchise`
              WHERE UPPER(`franchise_code`) = ?
                AND `is_deleted` = 1
                AND `franchise_is_active` = 1
              LIMIT 1";
    $result = runPrepared($conn, $query, 's', [$code]);
    if ($result && mysqli_num_rows($result) > 0) {
        return mysqli_fetch_assoc($result);
    }
    return false;
}

// ----- Helper: Verify employee by mobile (for OTP) -----
function getEmployeeByMobile($conn, $mobile, $company_id) {
    $mobile = trim($mobile);
    $query = "SELECT * FROM `tbl_user`
              WHERE `employee_mobile` = ?
                AND `company_id` = ?
                AND `is_deleted` = 1
                AND `employee_status` = 1
              LIMIT 1";
    $result = runPrepared($conn, $query, 'ss', [$mobile, $company_id]);
    if ($result && mysqli_num_rows($result) > 0) {
        return mysqli_fetch_assoc($result);
    }
    return false;
}

// ----- Helper: Verify employee by password (MD5) -----
function verifyEmployeePassword($conn, $mobile, $password, $company_id) {
    $mobile = trim($mobile);
    $password = md5($password); // MD5 hashed in database
    $query = "SELECT * FROM `tbl_user`
              WHERE `employee_mobile` = ?
                AND `employee_password` = ?
                AND `company_id` = ?
                AND `is_deleted` = 1
                AND `employee_status` = 1
              LIMIT 1";
    $result = runPrepared($conn, $query, 'sss', [$mobile, $password, $company_id]);
    if ($result && mysqli_num_rows($result) > 0) {
        return mysqli_fetch_assoc($result);
    }
    return false;
}

// ----- Helper: Generate token -----
function generateToken($length = 32) {
    return bin2hex(random_bytes($length));
}

// ----- Helper: Generate 6-digit OTP -----
function generateOTP() {
    return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
}

// ----- Ensure OTP time column exists -----
function ensureOtpTimeColumn($conn) {
    $check = "SHOW COLUMNS FROM `tbl_user` LIKE 'employee_otp_time'";
    $result = mysqli_query($conn, $check);
    if ($result === false) {
        logError('login', 'SHOW COLUMNS failed: ' . mysqli_error($conn));
        return;
    }
    if (mysqli_num_rows($result) == 0) {
        $alter = "ALTER TABLE `tbl_user` ADD COLUMN `employee_otp_time` DATETIME NULL DEFAULT NULL";
        if (!mysqli_query($conn, $alter)) {
            logError('login', 'ALTER TABLE failed: ' . mysqli_error($conn));
        }
    }
}
ensureOtpTimeColumn($sql);

// ----- Main switch -----
$response = ['status' => 'error', 'message' => 'Invalid request'];
http_response_code(400);

switch ($type) {

    // ----- CASE 1: Company verification -----
    case 1: {
        $company_code = isset($postData['company_code']) ? trim($postData['company_code']) : '';
        if (empty($company_code)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company code is required'];
            break;
        }

        $franchise = verifyFranchise($sql, $company_code);
        if (!$franchise) {
            http_response_code(404);
            $response = ['status' => 'error', 'message' => 'Invalid or inactive company code'];
            break;
        }

        $today = date('Y-m-d');
        $renewal_date = $franchise['franchise_renewal_date'];
        $renewal_expired = ($renewal_date && strtotime($today) > strtotime($renewal_date));
        $renewal_message = $renewal_expired ? 'Your subscription has expired. Please contact Sunshine Infotech for renewal.' : '';

        http_response_code(200);
        $response = [
            'status' => 'success',
            'message' => 'Company verified',
            'company' => $franchise,
            'franchise_type' => (int) $franchise['franchise_type'],
            'renewal_expired' => $renewal_expired,
            'renewal_message' => $renewal_message
        ];
        break;
    }

    // ----- CASE 2: Password login -----
    case 2: {
        $company_code = isset($postData['company_code']) ? trim($postData['company_code']) : '';
        $mobile = isset($postData['mobile']) ? trim($postData['mobile']) : '';
        $password = isset($postData['password']) ? (string) $postData['password'] : '';

        if (empty($company_code) || empty($mobile) || empty($password)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company code, mobile, and password are required'];
            break;
        }

        $franchise = verifyFranchise($sql, $company_code);
        if (!$franchise) {
            http_response_code(404);
            $response = ['status' => 'error', 'message' => 'Invalid or inactive company'];
            break;
        }

        $employee = verifyEmployeePassword($sql, $mobile, $password, $franchise['company_id']);
        if (!$employee) {
            http_response_code(401);
            $response = ['status' => 'error', 'message' => 'Invalid mobile number or password'];
            logMessage('login', "Failed password login for mobile: $mobile", 'WARNING');
            break;
        }

        $today = date('Y-m-d');
        $renewal_date = $franchise['franchise_renewal_date'];
        $renewal_expired = ($renewal_date && strtotime($today) > strtotime($renewal_date));
        $renewal_message = $renewal_expired ? 'Your subscription has expired. Please contact Sunshine Infotech for renewal.' : '';

        $token = generateToken();
        http_response_code(200);
        $response = [
            'status' => 'success',
            'message' => 'Login successful',
            'token' => $token,
            'user' => [
                'emp_id' => $employee['employee_id'],
                'name' => $employee['employee_name'],
                'employee_mobile' => $employee['employee_mobile'],
                'email' => $employee['employee_email'],
                'employee_permission' => json_decode($employee['employee_permission'] ?? 'null', true) ?? []
            ],
            'company' => $franchise,
            'franchise_type' => (int) $franchise['franchise_type'],
            'renewal_expired' => $renewal_expired,
            'renewal_message' => $renewal_message
        ];
        logMessage('login', "User logged in via password: {$employee['employee_name']} (ID: {$employee['employee_id']})", 'SUCCESS');
        break;
    }

    // ----- CASE 3: Send OTP (mobile only) -----
    case 3: {
        $company_code = isset($postData['company_code']) ? trim($postData['company_code']) : '';
        $mobile = isset($postData['mobile']) ? trim($postData['mobile']) : '';

        if (empty($company_code) || empty($mobile)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company code and mobile are required'];
            break;
        }

        $franchise = verifyFranchise($sql, $company_code);
        if (!$franchise) {
            http_response_code(404);
            $response = ['status' => 'error', 'message' => 'Invalid or inactive company'];
            break;
        }

        $employee = getEmployeeByMobile($sql, $mobile, $franchise['company_id']);
        if (!$employee) {
            http_response_code(404);
            $response = ['status' => 'error', 'message' => 'Mobile number not registered'];
            break;
        }

        // Generate OTP and store
        $otp = generateOTP();
        $otp_time = date('Y-m-d H:i:s');
        $employee_id = $employee['employee_id'];

        $update = "UPDATE `tbl_user` SET `employee_otp` = ?, `employee_otp_time` = ? WHERE `employee_id` = ?";
        $updateResult = runPrepared($sql, $update, 'sss', [$otp, $otp_time, $employee_id]);

        if ($updateResult === false) {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Could not generate OTP. Please try again.'];
            break;
        }

        // In production, send OTP via SMS here.
        // For demo, we'll return it in response (remove in production)
        http_response_code(200);
        $response = [
            'status' => 'success',
            'message' => 'OTP sent successfully',
            'otp' => $otp, // Only for testing; remove in live
            'mobile' => $mobile
        ];
        logMessage('login', "OTP generated for mobile: $mobile (OTP: $otp)", 'INFO');
        break;
    }

    // ----- CASE 4: Verify OTP (mobile + OTP) -----
    case 4: {
        $company_code = isset($postData['company_code']) ? trim($postData['company_code']) : '';
        $mobile = isset($postData['mobile']) ? trim($postData['mobile']) : '';
        $otp_entered = isset($postData['otp']) ? trim($postData['otp']) : '';

        if (empty($company_code) || empty($mobile) || empty($otp_entered)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company code, mobile, and OTP are required'];
            break;
        }

        $franchise = verifyFranchise($sql, $company_code);
        if (!$franchise) {
            http_response_code(404);
            $response = ['status' => 'error', 'message' => 'Invalid or inactive company'];
            break;
        }

        $employee = getEmployeeByMobile($sql, $mobile, $franchise['company_id']);
        if (!$employee) {
            http_response_code(404);
            $response = ['status' => 'error', 'message' => 'Mobile number not registered'];
            break;
        }

        // Check OTP and expiry (10 minutes)
        $stored_otp = $employee['employee_otp'];
        $otp_time = $employee['employee_otp_time'];
        $valid = false;
        $message = 'Invalid OTP';

        if ($stored_otp && $otp_time) {
            $time_diff = time() - strtotime($otp_time);
            if ($time_diff <= 600 && hash_equals((string) $stored_otp, (string) $otp_entered)) {
                $valid = true;
            } elseif ($time_diff > 600) {
                $message = 'OTP has expired. Please request a new one.';
            } else {
                $message = 'Invalid OTP';
            }
        }

        if (!$valid) {
            http_response_code(401);
            $response = ['status' => 'error', 'message' => $message];
            logMessage('login', "OTP verification failed for mobile: $mobile", 'WARNING');
            break;
        }

        // Renewal check
        $today = date('Y-m-d');
        $renewal_date = $franchise['franchise_renewal_date'];
        $renewal_expired = ($renewal_date && strtotime($today) > strtotime($renewal_date));
        $renewal_message = $renewal_expired ? 'Your subscription has expired. Please contact Sunshine Infotech for renewal.' : '';

        $token = generateToken();
        http_response_code(200);
        $response = [
            'status' => 'success',
            'message' => 'Login successful',
            'token' => $token,
            'user' => [
                'emp_id' => $employee['employee_id'],
                'name' => $employee['employee_name'],
                'employee_mobile' => $employee['employee_mobile'],
                'email' => $employee['employee_email'],
                'employee_permission' => json_decode($employee['employee_permission'] ?? 'null', true) ?? []
            ],
            'company' => $franchise,
            'franchise_type' => (int) $franchise['franchise_type'],
            'renewal_expired' => $renewal_expired,
            'renewal_message' => $renewal_message
        ];

        // Clear OTP after successful login
        $clear = "UPDATE `tbl_user` SET `employee_otp` = NULL, `employee_otp_time` = NULL WHERE `employee_id` = ?";
        runPrepared($sql, $clear, 's', [$employee['employee_id']]);

        logMessage('login', "User logged in via OTP: {$employee['employee_name']} (ID: {$employee['employee_id']})", 'SUCCESS');
        break;
    }

    default:
        http_response_code(400);
        $response = ['status' => 'error', 'message' => 'Invalid request type'];
        break;
}

logResponse('login', $response);
echo json_encode($response);
mysqli_close($sql);