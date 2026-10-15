<?php
// v1_api/employee.php
require_once 'dbconnection.php';

if (isset($GLOBALS['_RAW_INPUT'])) {
    $postData = json_decode($GLOBALS['_RAW_INPUT'], true);
} else {
    $postData = json_decode(file_get_contents('php://input'), true);
}

logRequest('employee', $postData);

if (empty($postData)) {
    http_response_code(400);
    $response = ['status' => 'error', 'message' => 'No data received'];
    logResponse('employee', $response);
    echo json_encode($response);
    exit;
}

$type = isset($postData['type']) ? intval($postData['type']) : 0;

$company_id   = isset($postData['company_id']) ? mysqli_real_escape_string($sql, trim($postData['company_id'])) : '';
$employee_id  = isset($postData['employee_id']) ? intval($postData['employee_id']) : 0;

// Input fields
$employee_name       = isset($postData['employee_name']) ? mysqli_real_escape_string($sql, trim($postData['employee_name'])) : '';
$employee_mobile     = isset($postData['employee_mobile']) ? mysqli_real_escape_string($sql, trim($postData['employee_mobile'])) : '';
$employee_email      = isset($postData['employee_email']) ? mysqli_real_escape_string($sql, trim($postData['employee_email'])) : '';
$employee_password   = isset($postData['employee_password']) ? trim($postData['employee_password']) : '';
$employee_salary     = isset($postData['employee_salary']) ? floatval($postData['employee_salary']) : 0;
$employee_joining    = isset($postData['employee_joining_date']) ? mysqli_real_escape_string($sql, trim($postData['employee_joining_date'])) : '';
$employee_status     = isset($postData['employee_status']) ? intval($postData['employee_status']) : 1;
$employee_role_id    = isset($postData['employee_role_id']) ? intval($postData['employee_role_id']) : 0;
$employee_permission = isset($postData['employee_permission']) ? mysqli_real_escape_string($sql, json_encode($postData['employee_permission'])) : '';
$franchise_ids       = isset($postData['employee_franchisy_multiple_ids']) ? trim($postData['employee_franchisy_multiple_ids']) : '';
// Ensure comma-separated list of IDs
if (!empty($franchise_ids)) {
    $franchise_ids = mysqli_real_escape_string($sql, $franchise_ids);
}

$response = ['status' => 'error', 'message' => 'Invalid request'];
http_response_code(400);

switch ($type) {
    // ----- 1. Insert new employee -----
    case 1:
        if (empty($company_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }
        if (empty($employee_name)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Employee name is required'];
            break;
        }
        if (empty($employee_mobile)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Mobile number is required'];
            break;
        }
        if (empty($employee_password)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Password is required'];
            break;
        }

        // Check duplicate mobile
        $checkQuery = "SELECT employee_id FROM tbl_user 
                       WHERE employee_mobile = '$employee_mobile' 
                         AND company_id = '$company_id' 
                         AND is_deleted = '1'";
        $checkResult = mysqli_query($sql, $checkQuery);
        if ($checkResult && mysqli_num_rows($checkResult) > 0) {
            http_response_code(409);
            $response = ['status' => 'error', 'message' => 'A user with this mobile already exists'];
            break;
        }

        // Hash password with MD5 (as per existing system)
        $hashed_password = md5($employee_password);

        $query = "INSERT INTO tbl_user (
                    company_id, employee_franchisy_multiple_ids, employee_mobile,
                    employee_password, employee_name, employee_email,
                    employee_salary_monthly, employee_joining_date,
                    employee_role_id, employee_permission, employee_status,
                    is_deleted, c_date
                  ) VALUES (
                    '$company_id', '$franchise_ids', '$employee_mobile',
                    '$hashed_password', '$employee_name', '$employee_email',
                    '$employee_salary', '$employee_joining',
                    '$employee_role_id', '$employee_permission', '$employee_status',
                    '1', NOW()
                  )";

        if (mysqli_query($sql, $query)) {
            $new_id = mysqli_insert_id($sql);
            logMessage('employee', "New employee added: $employee_name (ID: $new_id)", 'INFO');
            http_response_code(201);
            $response = [
                'status' => 'success',
                'message' => 'Employee added successfully',
                'employee_id' => $new_id
            ];
        } else {
            $error = mysqli_error($sql);
            logError('employee', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to add employee: ' . $error];
        }
        break;

    // ----- 2. Get all employees (with franchise names) -----
    case 2:
        if (empty($company_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }

        $query = "SELECT e.*, 
                         (SELECT GROUP_CONCAT(f.franchise_name SEPARATOR ', ') 
                          FROM tbl_franchise f 
                          WHERE FIND_IN_SET(f.franchise_id, e.employee_franchisy_multiple_ids) 
                            AND f.is_deleted = '1'
                         ) AS franchise_names
                  FROM tbl_user e
                  WHERE e.company_id = '$company_id'
                    AND e.is_deleted = '1'
                  ORDER BY e.c_date DESC";
        $result = mysqli_query($sql, $query);

        if ($result) {
            $employees = [];
            while ($row = mysqli_fetch_assoc($result)) {
                $employees[] = $row;
            }
            logMessage('employee', "Fetched " . count($employees) . " employees", 'INFO');
            http_response_code(200);
            $response = [
                'status' => 'success',
                'message' => 'Employees fetched successfully',
                'data' => $employees,
                'total' => count($employees)
            ];
        } else {
            $error = mysqli_error($sql);
            logError('employee', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to fetch employees: ' . $error];
        }
        break;

    // ----- 3. Update employee -----
    case 3:
        if (empty($employee_id) || empty($company_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Employee ID and company ID are required'];
            break;
        }
        if (empty($employee_name)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Employee name is required'];
            break;
        }

        // Check duplicate mobile (exclude self)
        $checkQuery = "SELECT employee_id FROM tbl_user 
                       WHERE employee_mobile = '$employee_mobile' 
                         AND company_id = '$company_id' 
                         AND is_deleted = '1'
                         AND employee_id != '$employee_id'";
        $checkResult = mysqli_query($sql, $checkQuery);
        if ($checkResult && mysqli_num_rows($checkResult) > 0) {
            http_response_code(409);
            $response = ['status' => 'error', 'message' => 'A user with this mobile already exists'];
            break;
        }

        // Build update query (password only if provided)
        $passwordSet = '';
        if (!empty($employee_password)) {
            $hashed_password = md5($employee_password);
            $passwordSet = ", employee_password = '$hashed_password'";
        }

        $query = "UPDATE tbl_user SET
                    employee_franchisy_multiple_ids = '$franchise_ids',
                    employee_mobile = '$employee_mobile',
                    employee_name = '$employee_name',
                    employee_email = '$employee_email',
                    employee_salary_monthly = '$employee_salary',
                    employee_joining_date = '$employee_joining',
                    employee_role_id = '$employee_role_id',
                    employee_permission = '$employee_permission',
                    employee_status = '$employee_status'
                    $passwordSet,
                    u_date = NOW()
                  WHERE employee_id = '$employee_id'
                    AND company_id = '$company_id'
                    AND is_deleted = '1'";

        if (mysqli_query($sql, $query)) {
            if (mysqli_affected_rows($sql) === 0) {
                http_response_code(200);
                $response = ['status' => 'success', 'message' => 'No changes to save'];
            } else {
                logMessage('employee', "Employee updated: $employee_name (ID: $employee_id)", 'INFO');
                http_response_code(200);
                $response = ['status' => 'success', 'message' => 'Employee updated successfully'];
            }
        } else {
            $error = mysqli_error($sql);
            logError('employee', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to update employee: ' . $error];
        }
        break;

    // ----- 4. Soft delete employee -----
    case 4:
        if (empty($employee_id) || empty($company_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Employee ID and company ID are required'];
            break;
        }

        $query = "UPDATE tbl_user SET is_deleted = '0' 
                  WHERE employee_id = '$employee_id' 
                    AND company_id = '$company_id'";
        if (mysqli_query($sql, $query)) {
            if (mysqli_affected_rows($sql) === 0) {
                http_response_code(404);
                $response = ['status' => 'error', 'message' => 'Employee not found'];
            } else {
                logMessage('employee', "Employee deleted (ID: $employee_id)", 'INFO');
                http_response_code(200);
                $response = ['status' => 'success', 'message' => 'Employee deleted successfully'];
            }
        } else {
            $error = mysqli_error($sql);
            logError('employee', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to delete employee: ' . $error];
        }
        break;

    // ----- 5. Get single employee by ID -----
    case 5:
        if (empty($employee_id) || empty($company_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Employee ID and company ID are required'];
            break;
        }

        $query = "SELECT * FROM tbl_user
                  WHERE employee_id = '$employee_id' 
                    AND company_id = '$company_id' 
                    AND is_deleted = '1'";
        $result = mysqli_query($sql, $query);

        if ($result && mysqli_num_rows($result) > 0) {
            $row = mysqli_fetch_assoc($result);
            http_response_code(200);
            $response = ['status' => 'success', 'message' => 'Employee fetched successfully', 'data' => $row];
        } else {
            http_response_code(404);
            $response = ['status' => 'error', 'message' => 'Employee not found'];
        }
        break;

    // ----- 6. Change password -----
    case 6:
        if (empty($employee_id) || empty($company_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Employee ID and company ID are required'];
            break;
        }
        if (empty($employee_password)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'New password is required'];
            break;
        }

        $hashed_password = md5($employee_password);
        $query = "UPDATE tbl_user SET 
                    employee_password = '$hashed_password',
                    u_date = NOW()
                  WHERE employee_id = '$employee_id' 
                    AND company_id = '$company_id'
                    AND is_deleted = '1'";
        if (mysqli_query($sql, $query)) {
            if (mysqli_affected_rows($sql) === 0) {
                http_response_code(404);
                $response = ['status' => 'error', 'message' => 'Employee not found'];
            } else {
                logMessage('employee', "Password changed for employee ID: $employee_id", 'INFO');
                http_response_code(200);
                $response = ['status' => 'success', 'message' => 'Password changed successfully'];
            }
        } else {
            $error = mysqli_error($sql);
            logError('employee', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to change password: ' . $error];
        }
        break;

    default:
        http_response_code(400);
        $response = ['status' => 'error', 'message' => 'Invalid request type'];
        logError('employee', "Invalid request type: $type");
}

logResponse('employee', $response);
echo json_encode($response);
mysqli_close($sql);
?>