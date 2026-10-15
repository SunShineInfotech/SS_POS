<?php
// v1_api/vendor.php
require_once 'dbconnection.php';

$postData = json_decode(file_get_contents('php://input'), true);

logRequest('vendor', $postData);

if (empty($postData)) {
    $response = ['status' => 'error', 'message' => 'No data received'];
    logResponse('vendor', $response);
    echo json_encode($response);
    exit;
}

$type = isset($postData['type']) ? intval($postData['type']) : 0;

$company_id   = isset($postData['company_id']) ? mysqli_real_escape_string($sql, $postData['company_id']) : '';
$franchise_id = isset($postData['franchise_id']) ? mysqli_real_escape_string($sql, $postData['franchise_id']) : '';
$vendor_id    = isset($postData['vendor_id']) ? intval($postData['vendor_id']) : 0;

$vendor_name       = isset($postData['vendor_name']) ? mysqli_real_escape_string($sql, $postData['vendor_name']) : '';
$vendor_mobile_no  = isset($postData['vendor_mobile_no']) ? mysqli_real_escape_string($sql, $postData['vendor_mobile_no']) : '';
$vendor_email_id   = isset($postData['vendor_email_id']) ? mysqli_real_escape_string($sql, $postData['vendor_email_id']) : '';
$vendor_state_id   = isset($postData['vendor_state_id']) ? intval($postData['vendor_state_id']) : 0;
$vendor_city_name  = isset($postData['vendor_city_name']) ? mysqli_real_escape_string($sql, $postData['vendor_city_name']) : '';
$vendor_address    = isset($postData['vendor_address']) ? mysqli_real_escape_string($sql, $postData['vendor_address']) : '';
$vendor_gst_number = isset($postData['vendor_gst_number']) ? mysqli_real_escape_string($sql, $postData['vendor_gst_number']) : '';

// Opening outstanding: used ONLY when a vendor is created (type 1).
// After that, vendor_wallet changes only through purchases and payments.
$vendor_wallet = isset($postData['vendor_wallet']) ? round(floatval($postData['vendor_wallet']), 2) : 0;

$response = ['status' => 'error', 'message' => 'Invalid request'];

switch ($type) {

    // 1. Insert new vendor
    case 1:
        if (empty($company_id)) {
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }
        if (empty($vendor_name)) {
            $response = ['status' => 'error', 'message' => 'Vendor name is required'];
            break;
        }

        if (!empty($vendor_mobile_no)) {
            $checkQuery = "SELECT vendor_id FROM tbl_vendor
                           WHERE company_id = '$company_id'
                           AND vendor_mobile_no = '$vendor_mobile_no'
                           AND is_deleted = '1'";

            $checkResult = mysqli_query($sql, $checkQuery);
            if ($checkResult && mysqli_num_rows($checkResult) > 0) {
                $response = ['status' => 'error', 'message' => 'A vendor with this mobile number already exists'];
                break;
            }
        }

        $query = "INSERT INTO tbl_vendor (
                    company_id, franchise_id, vendor_name, vendor_mobile_no, vendor_email_id,
                    vendor_state_id, vendor_city_name, vendor_address, vendor_gst_number,
                    vendor_wallet, is_deleted, c_date
                  ) VALUES (
                    '$company_id', '$franchise_id', '$vendor_name', '$vendor_mobile_no', '$vendor_email_id',
                    '$vendor_state_id', '$vendor_city_name', '$vendor_address', '$vendor_gst_number',
                    '$vendor_wallet', '1', NOW()
                  )";

        if (mysqli_query($sql, $query)) {
            $new_id = mysqli_insert_id($sql);
            logMessage('vendor', "New vendor added: $vendor_name (ID: $new_id)", 'INFO');
            $response = [
                'status'    => 'success',
                'message'   => 'Vendor added successfully',
                'vendor_id' => $new_id
            ];
        } else {
            $error = mysqli_error($sql);
            logError('vendor', $error);
            $response = ['status' => 'error', 'message' => 'Failed to add vendor: ' . $error];
        }
        break;

    // 2. Get all vendors
    case 2:
        if (empty($company_id)) {
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }

        $query = "SELECT * FROM tbl_vendor
                  WHERE company_id = '$company_id'
                  AND franchise_id = '$franchise_id'
                  AND is_deleted = '1'
                  ORDER BY c_date DESC";

        $result = mysqli_query($sql, $query);

        if ($result) {
            $vendors = [];
            while ($row = mysqli_fetch_assoc($result)) {
                $vendors[] = $row;
            }
            logMessage('vendor', "Fetched " . count($vendors) . " vendors", 'INFO');
            $response = [
                'status'  => 'success',
                'message' => 'Vendors fetched successfully',
                'data'    => $vendors,
                'total'   => count($vendors)
            ];
        } else {
            $error = mysqli_error($sql);
            logError('vendor', $error);
            $response = ['status' => 'error', 'message' => 'Failed to fetch vendors: ' . $error];
        }
        break;

    // 3. Update vendor (outstanding is NOT updated here)
    case 3:
        if (empty($vendor_id)) {
            $response = ['status' => 'error', 'message' => 'Vendor ID is required'];
            break;
        }
        if (empty($company_id)) {
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }
        if (empty($vendor_name)) {
            $response = ['status' => 'error', 'message' => 'Vendor name is required'];
            break;
        }

        if (!empty($vendor_mobile_no)) {
            $checkQuery = "SELECT vendor_id FROM tbl_vendor
                           WHERE company_id = '$company_id'
                           AND franchise_id = '$franchise_id'
                           AND vendor_mobile_no = '$vendor_mobile_no'
                           AND is_deleted = '1'
                           AND vendor_id != '$vendor_id'";
            $checkResult = mysqli_query($sql, $checkQuery);
            if ($checkResult && mysqli_num_rows($checkResult) > 0) {
                $response = ['status' => 'error', 'message' => 'A vendor with this mobile number already exists'];
                break;
            }
        }

        // vendor_wallet is left out on purpose: it is kept in sync by
        // purchase.php (bill added / edited / deleted) and purchase_payment.php (payments).
        $query = "UPDATE tbl_vendor SET
                    vendor_name = '$vendor_name',
                    vendor_mobile_no = '$vendor_mobile_no',
                    vendor_email_id = '$vendor_email_id',
                    vendor_state_id = '$vendor_state_id',
                    vendor_city_name = '$vendor_city_name',
                    vendor_address = '$vendor_address',
                    vendor_gst_number = '$vendor_gst_number',
                    u_date = NOW()
                  WHERE vendor_id = '$vendor_id'
                  AND company_id = '$company_id'
                  AND franchise_id = '$franchise_id'
                  AND is_deleted = '1'";

        if (mysqli_query($sql, $query)) {
            logMessage('vendor', "Vendor updated: $vendor_name (ID: $vendor_id)", 'INFO');
            $response = ['status' => 'success', 'message' => 'Vendor updated successfully'];
        } else {
            $error = mysqli_error($sql);
            logError('vendor', $error);
            $response = ['status' => 'error', 'message' => 'Failed to update vendor: ' . $error];
        }
        break;

    // 4. Soft delete vendor
    case 4:
        if (empty($vendor_id)) {
            $response = ['status' => 'error', 'message' => 'Vendor ID is required'];
            break;
        }
        if (empty($company_id)) {
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }

        $query = "UPDATE tbl_vendor
                  SET is_deleted = '0'
                  WHERE vendor_id = '$vendor_id'
                  AND franchise_id = '$franchise_id'
                  AND company_id = '$company_id'";

        if (mysqli_query($sql, $query)) {
            logMessage('vendor', "Vendor deleted (ID: $vendor_id)", 'INFO');
            $response = ['status' => 'success', 'message' => 'Vendor deleted successfully'];
        } else {
            $error = mysqli_error($sql);
            logError('vendor', $error);
            $response = ['status' => 'error', 'message' => 'Failed to delete vendor: ' . $error];
        }
        break;

    // 5. Get single vendor by ID
    case 5:
        if (empty($vendor_id)) {
            $response = ['status' => 'error', 'message' => 'Vendor ID is required'];
            break;
        }
        if (empty($company_id)) {
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }

        $query = "SELECT * FROM tbl_vendor
                  WHERE vendor_id = '$vendor_id'
                  AND company_id = '$company_id'
                  AND franchise_id = '$franchise_id'
                  AND is_deleted = '1'";

        $result = mysqli_query($sql, $query);

        if ($result && mysqli_num_rows($result) > 0) {
            $row = mysqli_fetch_assoc($result);
            $response = ['status' => 'success', 'message' => 'Vendor fetched successfully', 'data' => $row];
        } else {
            $response = ['status' => 'error', 'message' => 'Vendor not found'];
        }
        break;

    default:
        $response = ['status' => 'error', 'message' => 'Invalid request type'];
        logError('vendor', "Invalid request type: $type");
}

logResponse('vendor', $response);
echo json_encode($response);
mysqli_close($sql);
?>