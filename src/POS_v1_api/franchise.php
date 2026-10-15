<?php
// v1_api/franchise.php
require_once 'dbconnection.php';

$postData = json_decode(file_get_contents('php://input'), true);

logRequest('franchise', $postData);

if (empty($postData)) {
    $response = ['status' => 'error', 'message' => 'No data received'];
    logResponse('franchise', $response);
    echo json_encode($response);
    exit;
}

$type = isset($postData['type']) ? intval($postData['type']) : 0;

$company_id   = isset($postData['company_id']) ? mysqli_real_escape_string($sql, $postData['company_id']) : '';
$franchise_id = isset($postData['franchise_id']) ? intval($postData['franchise_id']) : 0;

$franchise_code            = isset($postData['franchise_code']) ? mysqli_real_escape_string($sql, $postData['franchise_code']) : '';
$franchise_billing_name    = isset($postData['franchise_billing_name']) ? mysqli_real_escape_string($sql, $postData['franchise_billing_name']) : '';
$franchise_name            = isset($postData['franchise_name']) ? mysqli_real_escape_string($sql, $postData['franchise_name']) : '';
$franchise_number          = isset($postData['franchise_number']) ? mysqli_real_escape_string($sql, $postData['franchise_number']) : '';
$franchise_favicon         = isset($postData['franchise_favicon']) ? mysqli_real_escape_string($sql, $postData['franchise_favicon']) : '';
$franchise_header_logo     = isset($postData['franchise_header_logo']) ? mysqli_real_escape_string($sql, $postData['franchise_header_logo']) : '';
$franchise_email           = isset($postData['franchise_email']) ? mysqli_real_escape_string($sql, $postData['franchise_email']) : '';
$franchise_website         = isset($postData['franchise_website']) ? mysqli_real_escape_string($sql, $postData['franchise_website']) : '';
$franchise_whatsapp_number = isset($postData['franchise_whatsapp_number']) ? mysqli_real_escape_string($sql, $postData['franchise_whatsapp_number']) : '';
$franchise_address         = isset($postData['franchise_address']) ? mysqli_real_escape_string($sql, $postData['franchise_address']) : '';
$franchise_currency_symbol = isset($postData['franchise_currency_symbol']) ? mysqli_real_escape_string($sql, $postData['franchise_currency_symbol']) : '₹';
$franchise_invoice_prefix  = isset($postData['franchise_invoice_prefix']) ? mysqli_real_escape_string($sql, $postData['franchise_invoice_prefix']) : '';
$franchise_renewal_date    = isset($postData['franchise_renewal_date']) ? mysqli_real_escape_string($sql, $postData['franchise_renewal_date']) : '';
$franchise_renewal_amount  = isset($postData['franchise_renewal_amount']) ? floatval($postData['franchise_renewal_amount']) : 0;
$franchise_state_id        = isset($postData['franchise_state_id']) ? intval($postData['franchise_state_id']) : 0;
$franchise_city_name       = isset($postData['franchise_city_name']) ? mysqli_real_escape_string($sql, $postData['franchise_city_name']) : '';
$franchise_is_active       = isset($postData['franchise_is_active']) ? intval($postData['franchise_is_active']) : 1;

$response = ['status' => 'error', 'message' => 'Invalid request'];

switch ($type) {

    // 1. Insert new franchise
    case 1:
        if (empty($company_id)) {
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }
        if (empty($franchise_code)) {
            $response = ['status' => 'error', 'message' => 'Franchise code is required'];
            break;
        }
        if (empty($franchise_name)) {
            $response = ['status' => 'error', 'message' => 'Franchise name is required'];
            break;
        }

        $checkQuery = "SELECT franchise_id FROM tbl_franchise
                       WHERE company_id = '$company_id'
                       AND franchise_code = '$franchise_code'
                       AND is_deleted = '1'";
        $checkResult = mysqli_query($sql, $checkQuery);
        if (mysqli_num_rows($checkResult) > 0) {
            $response = ['status' => 'error', 'message' => 'A franchise with this code already exists'];
            break;
        }

        $renewalDateValue = !empty($franchise_renewal_date) ? "'$franchise_renewal_date'" : 'NULL';
        $stateIdValue = $franchise_state_id > 0 ? "'$franchise_state_id'" : 'NULL';

        $query = "INSERT INTO tbl_franchise (
                    company_id, franchise_code, franchise_billing_name, franchise_name,
                    franchise_number, franchise_favicon, franchise_header_logo, franchise_email,
                    franchise_website, franchise_whatsapp_number, franchise_address,
                    franchise_currency_symbol, franchise_invoice_prefix, franchise_invoice_id,
                    franchise_renewal_date, franchise_renewal_amount, franchise_state_id,
                    franchise_city_name, franchise_is_active, is_deleted, c_date
                  ) VALUES (
                    '$company_id', '$franchise_code', '$franchise_billing_name', '$franchise_name',
                    '$franchise_number', '$franchise_favicon', '$franchise_header_logo', '$franchise_email',
                    '$franchise_website', '$franchise_whatsapp_number', '$franchise_address',
                    '$franchise_currency_symbol', '$franchise_invoice_prefix', 0,
                    $renewalDateValue, '$franchise_renewal_amount', $stateIdValue,
                    '$franchise_city_name', '$franchise_is_active', '1', NOW()
                  )";

        if (mysqli_query($sql, $query)) {
            $new_id = mysqli_insert_id($sql);
            logMessage('franchise', "New franchise added: $franchise_name (ID: $new_id)", 'INFO');
            $response = [
                'status' => 'success',
                'message' => 'Franchise added successfully',
                'franchise_id' => $new_id
            ];
        } else {
            $error = mysqli_error($sql);
            logError('franchise', $error);
            $response = ['status' => 'error', 'message' => 'Failed to add franchise: ' . $error];
        }
        break;

    // 2. Get all franchises (optionally filtered to a single franchise_id,
    //    used to scope dropdowns to the logged-in user's own franchise)
    case 2:
        if (empty($company_id)) {
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }

        $query = "SELECT * FROM tbl_franchise
                  WHERE company_id = '$company_id'
                  AND is_deleted = '1'";

        if ($franchise_id > 0) {
            $query .= " AND franchise_id = '$franchise_id'";
        }

        $query .= " ORDER BY franchise_name ASC";

        $result = mysqli_query($sql, $query);

        if ($result) {
            $franchises = [];
            while ($row = mysqli_fetch_assoc($result)) {
                $franchises[] = $row;
            }
            logMessage('franchise', "Fetched " . count($franchises) . " franchises", 'INFO');
            $response = [
                'status' => 'success',
                'message' => 'Franchises fetched successfully',
                'data' => $franchises,
                'total' => count($franchises)
            ];
        } else {
            $error = mysqli_error($sql);
            logError('franchise', $error);
            $response = ['status' => 'error', 'message' => 'Failed to fetch franchises: ' . $error];
        }
        break;

    // 3. Update franchise
    case 3:
        if (empty($franchise_id)) {
            $response = ['status' => 'error', 'message' => 'Franchise ID is required'];
            break;
        }
        if (empty($company_id)) {
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }
        if (empty($franchise_name)) {
            $response = ['status' => 'error', 'message' => 'Franchise name is required'];
            break;
        }

        $checkQuery = "SELECT franchise_id FROM tbl_franchise
                       WHERE company_id = '$company_id'
                       AND franchise_code = '$franchise_code'
                       AND is_deleted = '1'
                       AND franchise_id != '$franchise_id'";
        $checkResult = mysqli_query($sql, $checkQuery);
        if (mysqli_num_rows($checkResult) > 0) {
            $response = ['status' => 'error', 'message' => 'A franchise with this code already exists'];
            break;
        }

        $renewalDateValue = !empty($franchise_renewal_date) ? "'$franchise_renewal_date'" : 'NULL';
        $stateIdValue = $franchise_state_id > 0 ? "'$franchise_state_id'" : 'NULL';

        $query = "UPDATE tbl_franchise SET
                    franchise_code = '$franchise_code',
                    franchise_billing_name = '$franchise_billing_name',
                    franchise_name = '$franchise_name',
                    franchise_number = '$franchise_number',
                    franchise_favicon = '$franchise_favicon',
                    franchise_header_logo = '$franchise_header_logo',
                    franchise_email = '$franchise_email',
                    franchise_website = '$franchise_website',
                    franchise_whatsapp_number = '$franchise_whatsapp_number',
                    franchise_address = '$franchise_address',
                    franchise_currency_symbol = '$franchise_currency_symbol',
                    franchise_invoice_prefix = '$franchise_invoice_prefix',
                    franchise_renewal_date = $renewalDateValue,
                    franchise_renewal_amount = '$franchise_renewal_amount',
                    franchise_state_id = $stateIdValue,
                    franchise_city_name = '$franchise_city_name',
                    franchise_is_active = '$franchise_is_active',
                    u_date = NOW()
                  WHERE franchise_id = '$franchise_id'
                  AND company_id = '$company_id'
                  AND is_deleted = '1'";

        if (mysqli_query($sql, $query)) {
            logMessage('franchise', "Franchise updated: $franchise_name (ID: $franchise_id)", 'INFO');
            $response = ['status' => 'success', 'message' => 'Franchise updated successfully'];
        } else {
            $error = mysqli_error($sql);
            logError('franchise', $error);
            $response = ['status' => 'error', 'message' => 'Failed to update franchise: ' . $error];
        }
        break;

    // 4. Soft delete franchise
    case 4:
        if (empty($franchise_id)) {
            $response = ['status' => 'error', 'message' => 'Franchise ID is required'];
            break;
        }
        if (empty($company_id)) {
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }

        $query = "UPDATE tbl_franchise
                  SET is_deleted = '0'
                  WHERE franchise_id = '$franchise_id'
                  AND company_id = '$company_id'";

        if (mysqli_query($sql, $query)) {
            logMessage('franchise', "Franchise deleted (ID: $franchise_id)", 'INFO');
            $response = ['status' => 'success', 'message' => 'Franchise deleted successfully'];
        } else {
            $error = mysqli_error($sql);
            logError('franchise', $error);
            $response = ['status' => 'error', 'message' => 'Failed to delete franchise: ' . $error];
        }
        break;

    // 5. Get single franchise by ID
    case 5:
        if (empty($franchise_id)) {
            $response = ['status' => 'error', 'message' => 'Franchise ID is required'];
            break;
        }
        if (empty($company_id)) {
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }

        $query = "SELECT * FROM tbl_franchise
                  WHERE franchise_id = '$franchise_id'
                  AND company_id = '$company_id'
                  AND is_deleted = '1'";

        $result = mysqli_query($sql, $query);

        if ($result && mysqli_num_rows($result) > 0) {
            $row = mysqli_fetch_assoc($result);
            $response = ['status' => 'success', 'message' => 'Franchise fetched successfully', 'data' => $row];
        } else {
            $response = ['status' => 'error', 'message' => 'Franchise not found'];
        }
        break;

    default:
        $response = ['status' => 'error', 'message' => 'Invalid request type'];
        logError('franchise', "Invalid request type: $type");
}

logResponse('franchise', $response);
echo json_encode($response);
mysqli_close($sql);
?>