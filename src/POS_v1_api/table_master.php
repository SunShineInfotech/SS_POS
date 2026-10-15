<?php
// v1_api/table_master.php
require_once 'dbconnection.php';

if (isset($GLOBALS['_RAW_INPUT'])) {
    $postData = json_decode($GLOBALS['_RAW_INPUT'], true);
} else {
    $postData = json_decode(file_get_contents('php://input'), true);
}

logRequest('table_master', $postData);

if (empty($postData)) {
    http_response_code(400);
    $response = ['status' => 'error', 'message' => 'No data received'];
    logResponse('table_master', $response);
    echo json_encode($response);
    exit;
}

$type = isset($postData['type']) ? intval($postData['type']) : 0;

$company_id   = isset($postData['company_id']) ? mysqli_real_escape_string($sql, trim($postData['company_id'])) : '';
$franchise_id = isset($postData['franchise_id']) ? mysqli_real_escape_string($sql, trim($postData['franchise_id'])) : '';
$table_id     = isset($postData['table_id']) ? intval($postData['table_id']) : 0;

$table_no       = isset($postData['table_no']) ? mysqli_real_escape_string($sql, trim($postData['table_no'])) : '';
$table_status   = isset($postData['table_status']) ? intval($postData['table_status']) : 1;
$table_capacity = isset($postData['table_capacity']) ? intval($postData['table_capacity']) : 4;

$response = ['status' => 'error', 'message' => 'Invalid request'];
http_response_code(400);

switch ($type) {

    // ----- 1. Insert new table -----
    case 1:
        if (empty($company_id) || empty($franchise_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company and franchise IDs are required'];
            break;
        }
        if (empty($table_no)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Table number is required'];
            break;
        }

        // Check duplicate table number
        $checkQuery = "SELECT table_id FROM tbl_table
                       WHERE company_id = '$company_id'
                         AND franchise_id = '$franchise_id'
                         AND table_no = '$table_no'
                         AND is_deleted = '1'";
        $checkResult = mysqli_query($sql, $checkQuery);
        if ($checkResult && mysqli_num_rows($checkResult) > 0) {
            http_response_code(409);
            $response = ['status' => 'error', 'message' => 'A table with this number already exists'];
            break;
        }

        // Note: column name is table_Capacity (capital C) in your DB
        $query = "INSERT INTO tbl_table (
                    company_id, franchise_id, table_no, table_status,
                    table_Capacity, is_deleted, c_date
                  ) VALUES (
                    '$company_id', '$franchise_id', '$table_no', '$table_status',
                    '$table_capacity', '1', NOW()
                  )";

        if (mysqli_query($sql, $query)) {
            $new_id = mysqli_insert_id($sql);
            logMessage('table_master', "New table added: $table_no (ID: $new_id)", 'INFO');
            http_response_code(201);
            $response = [
                'status' => 'success',
                'message' => 'Table added successfully',
                'table_id' => $new_id
            ];
        } else {
            $error = mysqli_error($sql);
            logError('table_master', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to add table: ' . $error];
        }
        break;

    // ----- 2. Get all tables (with franchise name) -----
    case 2:
        if (empty($company_id) || empty($franchise_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company and franchise IDs are required'];
            break;
        }

        $query = "SELECT tblt.*, tblf.franchise_name
                  FROM tbl_table AS tblt
                  LEFT JOIN tbl_franchise AS tblf ON tblf.franchise_id = tblt.franchise_id
                  WHERE tblt.company_id = '$company_id'
                    AND tblt.franchise_id = '$franchise_id'
                    AND tblt.is_deleted = '1'
                  ORDER BY tblt.c_date DESC";
        $result = mysqli_query($sql, $query);

        if ($result) {
            $tables = [];
            while ($row = mysqli_fetch_assoc($result)) {
                $tables[] = $row;
            }
            logMessage('table_master', "Fetched " . count($tables) . " tables", 'INFO');
            http_response_code(200);
            $response = [
                'status' => 'success',
                'message' => 'Tables fetched successfully',
                'data' => $tables,
                'total' => count($tables)
            ];
        } else {
            $error = mysqli_error($sql);
            logError('table_master', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to fetch tables: ' . $error];
        }
        break;

    // ----- 3. Update table -----
    case 3:
        if (empty($table_id) || empty($company_id) || empty($franchise_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Table ID, company, and franchise are required'];
            break;
        }
        if (empty($table_no)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Table number is required'];
            break;
        }

        // Check duplicate (exclude self)
        $checkQuery = "SELECT table_id FROM tbl_table
                       WHERE company_id = '$company_id'
                         AND franchise_id = '$franchise_id'
                         AND table_no = '$table_no'
                         AND is_deleted = '1'
                         AND table_id != '$table_id'";
        $checkResult = mysqli_query($sql, $checkQuery);
        if ($checkResult && mysqli_num_rows($checkResult) > 0) {
            http_response_code(409);
            $response = ['status' => 'error', 'message' => 'A table with this number already exists'];
            break;
        }

        $query = "UPDATE tbl_table SET
                    table_no = '$table_no',
                    table_status = '$table_status',
                    table_Capacity = '$table_capacity',
                    u_date = NOW()
                  WHERE table_id = '$table_id'
                    AND company_id = '$company_id'
                    AND franchise_id = '$franchise_id'
                    AND is_deleted = '1'";

        if (mysqli_query($sql, $query)) {
            if (mysqli_affected_rows($sql) === 0) {
                http_response_code(200);
                $response = ['status' => 'success', 'message' => 'No changes to save'];
            } else {
                logMessage('table_master', "Table updated: $table_no (ID: $table_id)", 'INFO');
                http_response_code(200);
                $response = ['status' => 'success', 'message' => 'Table updated successfully'];
            }
        } else {
            $error = mysqli_error($sql);
            logError('table_master', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to update table: ' . $error];
        }
        break;

    // ----- 4. Soft delete table -----
    case 4:
        if (empty($table_id) || empty($company_id) || empty($franchise_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Table ID, company, and franchise are required'];
            break;
        }

        $query = "UPDATE tbl_table
                  SET is_deleted = '0'
                  WHERE table_id = '$table_id'
                    AND company_id = '$company_id'
                    AND franchise_id = '$franchise_id'";
        if (mysqli_query($sql, $query)) {
            if (mysqli_affected_rows($sql) === 0) {
                http_response_code(404);
                $response = ['status' => 'error', 'message' => 'Table not found'];
            } else {
                logMessage('table_master', "Table deleted (ID: $table_id)", 'INFO');
                http_response_code(200);
                $response = ['status' => 'success', 'message' => 'Table deleted successfully'];
            }
        } else {
            $error = mysqli_error($sql);
            logError('table_master', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to delete table: ' . $error];
        }
        break;

    // ----- 5. Get single table by ID -----
    case 5:
        if (empty($table_id) || empty($company_id) || empty($franchise_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Table ID, company, and franchise are required'];
            break;
        }

        $query = "SELECT * FROM tbl_table
                  WHERE table_id = '$table_id'
                    AND company_id = '$company_id'
                    AND franchise_id = '$franchise_id'
                    AND is_deleted = '1'";
        $result = mysqli_query($sql, $query);

        if ($result && mysqli_num_rows($result) > 0) {
            $row = mysqli_fetch_assoc($result);
            http_response_code(200);
            $response = ['status' => 'success', 'message' => 'Table fetched successfully', 'data' => $row];
        } else {
            http_response_code(404);
            $response = ['status' => 'error', 'message' => 'Table not found'];
        }
        break;

    default:
        http_response_code(400);
        $response = ['status' => 'error', 'message' => 'Invalid request type'];
        logError('table_master', "Invalid request type: $type");
}

logResponse('table_master', $response);
echo json_encode($response);
mysqli_close($sql);
?>