<?php
// v1_api/state.php
require_once 'dbconnection.php';

$postData = json_decode(file_get_contents('php://input'), true);

logRequest('state', $postData);

if (empty($postData)) {
    $response = ['status' => 'error', 'message' => 'No data received'];
    logResponse('state', $response);
    echo json_encode($response);
    exit;
}

$type = isset($postData['type']) ? intval($postData['type']) : 0;

$company_id = isset($postData['company_id']) ? mysqli_real_escape_string($sql, $postData['company_id']) : '';
$state_id   = isset($postData['state_id']) ? intval($postData['state_id']) : 0;

$state_name   = isset($postData['state_name']) ? mysqli_real_escape_string($sql, $postData['state_name']) : '';
$state_active = isset($postData['state_active_inactive']) ? intval($postData['state_active_inactive']) : 1;

$response = ['status' => 'error', 'message' => 'Invalid request'];

switch ($type) {

    // 1. Insert new state
    case 1:
        if (empty($company_id)) {
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }
        if (empty($state_name)) {
            $response = ['status' => 'error', 'message' => 'State name is required'];
            break;
        }

        $checkQuery = "SELECT state_id FROM tbl_state
                       WHERE company_id = '$company_id'
                       AND state_name = '$state_name'
                       AND is_deleted = '1'";
        $checkResult = mysqli_query($sql, $checkQuery);
        if (mysqli_num_rows($checkResult) > 0) {
            $response = ['status' => 'error', 'message' => 'This state already exists'];
            break;
        }

        $query = "INSERT INTO tbl_state (
                    company_id, state_name, state_active_inactive, is_deleted, c_date
                  ) VALUES (
                    '$company_id', '$state_name', '$state_active', '1', NOW()
                  )";

        if (mysqli_query($sql, $query)) {
            $new_id = mysqli_insert_id($sql);
            logMessage('state', "New state added: $state_name (ID: $new_id)", 'INFO');
            $response = [
                'status' => 'success',
                'message' => 'State added successfully',
                'state_id' => $new_id
            ];
        } else {
            $error = mysqli_error($sql);
            logError('state', $error);
            $response = ['status' => 'error', 'message' => 'Failed to add state: ' . $error];
        }
        break;

    // 2. Get all states (used to populate dropdowns, e.g. vendor form)
    case 2:
        if (empty($company_id)) {
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }

        $query = "SELECT * FROM tbl_state
                  WHERE company_id = '$company_id'
                  AND is_deleted = '1'
                  AND state_active_inactive = '1'
                  ORDER BY state_name ASC";
        $result = mysqli_query($sql, $query);

        if ($result) {
            $states = [];
            while ($row = mysqli_fetch_assoc($result)) {
                $states[] = $row;
            }
            logMessage('state', "Fetched " . count($states) . " states", 'INFO');
            $response = [
                'status' => 'success',
                'message' => 'States fetched successfully',
                'data' => $states,
                'total' => count($states)
            ];
        } else {
            $error = mysqli_error($sql);
            logError('state', $error);
            $response = ['status' => 'error', 'message' => 'Failed to fetch states: ' . $error];
        }
        break;

    // 3. Update state
    case 3:
        if (empty($state_id)) {
            $response = ['status' => 'error', 'message' => 'State ID is required'];
            break;
        }
        if (empty($company_id)) {
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }
        if (empty($state_name)) {
            $response = ['status' => 'error', 'message' => 'State name is required'];
            break;
        }

        $checkQuery = "SELECT state_id FROM tbl_state
                       WHERE company_id = '$company_id'
                       AND state_name = '$state_name'
                       AND is_deleted = '1'
                       AND state_id != '$state_id'";
        $checkResult = mysqli_query($sql, $checkQuery);
        if (mysqli_num_rows($checkResult) > 0) {
            $response = ['status' => 'error', 'message' => 'This state already exists'];
            break;
        }

        $query = "UPDATE tbl_state SET
                    state_name = '$state_name',
                    state_active_inactive = '$state_active',
                    u_date = NOW()
                  WHERE state_id = '$state_id'
                  AND company_id = '$company_id'
                  AND is_deleted = '1'";

        if (mysqli_query($sql, $query)) {
            logMessage('state', "State updated: $state_name (ID: $state_id)", 'INFO');
            $response = ['status' => 'success', 'message' => 'State updated successfully'];
        } else {
            $error = mysqli_error($sql);
            logError('state', $error);
            $response = ['status' => 'error', 'message' => 'Failed to update state: ' . $error];
        }
        break;

    // 4. Soft delete state
    case 4:
        if (empty($state_id)) {
            $response = ['status' => 'error', 'message' => 'State ID is required'];
            break;
        }
        if (empty($company_id)) {
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }

        $query = "UPDATE tbl_state
                  SET is_deleted = '0'
                  WHERE state_id = '$state_id'
                  AND company_id = '$company_id'";

        if (mysqli_query($sql, $query)) {
            logMessage('state', "State deleted (ID: $state_id)", 'INFO');
            $response = ['status' => 'success', 'message' => 'State deleted successfully'];
        } else {
            $error = mysqli_error($sql);
            logError('state', $error);
            $response = ['status' => 'error', 'message' => 'Failed to delete state: ' . $error];
        }
        break;

    // 5. Get single state by ID
    case 5:
        if (empty($state_id)) {
            $response = ['status' => 'error', 'message' => 'State ID is required'];
            break;
        }
        if (empty($company_id)) {
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }

        $query = "SELECT * FROM tbl_state
                  WHERE state_id = '$state_id'
                  AND company_id = '$company_id'
                  AND is_deleted = '1'";

        $result = mysqli_query($sql, $query);

        if ($result && mysqli_num_rows($result) > 0) {
            $row = mysqli_fetch_assoc($result);
            $response = ['status' => 'success', 'message' => 'State fetched successfully', 'data' => $row];
        } else {
            $response = ['status' => 'error', 'message' => 'State not found'];
        }
        break;

    default:
        $response = ['status' => 'error', 'message' => 'Invalid request type'];
        logError('state', "Invalid request type: $type");
}

logResponse('state', $response);
echo json_encode($response);
mysqli_close($sql);
?>