<?php
require_once 'dbconnection.php';

if (isset($GLOBALS['_RAW_INPUT'])) {
    $postData = json_decode($GLOBALS['_RAW_INPUT'], true);
} else {
    $postData = json_decode(file_get_contents('php://input'), true);
}

logRequest('kot', $postData);

if (empty($postData)) {
    http_response_code(400);
    $response = ['status' => 'error', 'message' => 'No data received'];
    logResponse('kot', $response);
    echo json_encode($response);
    exit;
}

$type          = isset($postData['type']) ? intval($postData['type']) : 0;
$company_id    = isset($postData['company_id']) ? mysqli_real_escape_string($sql, trim($postData['company_id'])) : '';
$franchise_id  = isset($postData['franchise_id']) ? mysqli_real_escape_string($sql, trim($postData['franchise_id'])) : '';
$financial_year_id = isset($postData['financial_year_id']) ? intval($postData['financial_year_id']) : 0;
$table_id      = isset($postData['table_id']) ? intval($postData['table_id']) : 0;
$customer_id   = isset($postData['customer_id']) ? intval($postData['customer_id']) : 0;
$employee_id   = isset($postData['employee_id']) ? intval($postData['employee_id']) : 0;
$order_type    = isset($postData['order_type']) ? intval($postData['order_type']) : 1; // 1=Dine-in, etc.
$remark        = isset($postData['remark']) ? mysqli_real_escape_string($sql, trim($postData['remark'])) : '';
$items         = isset($postData['items']) ? $postData['items'] : []; // [{product_id, qty, special_instruction}]
$kot_id        = isset($postData['kot_id']) ? intval($postData['kot_id']) : 0;
$kot_status    = isset($postData['kot_status']) ? intval($postData['kot_status']) : 1;

$response = ['status' => 'error', 'message' => 'Invalid request'];
http_response_code(400);

switch ($type) {

    // 1. Create KOT from cart (or direct items)
    case 1: {
        if (empty($company_id) || empty($franchise_id) || empty($financial_year_id) || empty($table_id) || empty($items)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company, franchise, financial year, table and items required'];
            break;
        }

        // Generate KOT number (e.g., KOT-001)
        $prefix = "KOT-";
        $numQuery = "SELECT COUNT(*) as cnt FROM tbl_kot WHERE company_id = '$company_id' AND franchise_id = '$franchise_id'";
        $numRes = mysqli_query($sql, $numQuery);
        $count = 0;
        if ($numRes && $row = mysqli_fetch_assoc($numRes)) {
            $count = intval($row['cnt']) + 1;
        }
        $kot_number = $prefix . str_pad($count, 3, '0', STR_PAD_LEFT);

        // Insert KOT header
        $query = "INSERT INTO tbl_kot
                  (company_id, franchise_id, financial_year_id, kot_number, kot_table_id,
                   kot_customer_id, kot_order_type, kot_status, kot_order_time,
                   kot_employee_id, kot_remark, is_deleted, c_date)
                  VALUES ('$company_id', '$franchise_id', $financial_year_id, '$kot_number', $table_id,
                          $customer_id, $order_type, 1, NOW(), $employee_id, '$remark', 1, NOW())";
        if (!mysqli_query($sql, $query)) {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to create KOT: ' . mysqli_error($sql)];
            break;
        }
        $kot_id = mysqli_insert_id($sql);

        // Insert KOT details
        $inserted = 0;
        foreach ($items as $item) {
            $product_id = intval($item['product_id']);
            $qty = intval($item['qty']);
            $inst = isset($item['special_instruction']) ? mysqli_real_escape_string($sql, $item['special_instruction']) : '';
            if ($qty <= 0) continue;

            $detailQuery = "INSERT INTO tbl_kot_details
                            (company_id, kot_details_kot_id, kot_details_product_id,
                             kot_details_qty, kot_details_special_instraction,
                             kot_details_status, is_deleted, c_date)
                            VALUES ('$company_id', $kot_id, $product_id,
                                    $qty, '$inst', 1, 1, NOW())";
            if (mysqli_query($sql, $detailQuery)) {
                $inserted++;
            } else {
                logError('kot', 'Detail insert failed: ' . mysqli_error($sql));
            }
        }

        logMessage('kot', "KOT $kot_number created with $inserted items", 'INFO');
        http_response_code(201);
        $response = [
            'status' => 'success',
            'message' => 'Order placed',
            'kot_id' => $kot_id,
            'kot_number' => $kot_number
        ];
        break;
    }

    // 2. List KOTs (for kitchen) – optionally filter by status
    case 2: {
        $where = "k.company_id = '$company_id' AND k.franchise_id = '$franchise_id' AND k.is_deleted = 1";
        if (isset($postData['kot_status']) && $postData['kot_status'] > 0) {
            $where .= " AND k.kot_status = " . intval($postData['kot_status']);
        }

        $query = "SELECT k.*, 
                         (SELECT GROUP_CONCAT(CONCAT(kd.kot_details_product_id, ':', kd.kot_details_qty)) 
                          FROM tbl_kot_details kd WHERE kd.kot_details_kot_id = k.kot_id AND kd.is_deleted = 1) as items_summary
                  FROM tbl_kot k
                  WHERE $where
                  ORDER BY k.kot_order_time DESC";
        $result = mysqli_query($sql, $query);
        if ($result) {
            $kots = [];
            while ($row = mysqli_fetch_assoc($result)) {
                $kots[] = $row;
            }
            http_response_code(200);
            $response = ['status' => 'success', 'data' => $kots];
        } else {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Fetch failed: ' . mysqli_error($sql)];
        }
        break;
    }

    // 3. Update KOT status (for kitchen)
    case 3: {
        if (empty($kot_id) || empty($kot_status)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'KOT ID and status required'];
            break;
        }
        $timeField = '';
        if ($kot_status == 2) $timeField = ", kot_ready_time = NOW()";
        elseif ($kot_status == 3) $timeField = ", kot_served_time = NOW()";

        $query = "UPDATE tbl_kot SET kot_status = $kot_status $timeField, u_date = NOW()
                  WHERE kot_id = $kot_id AND company_id = '$company_id' AND franchise_id = '$franchise_id'";
        if (mysqli_query($sql, $query)) {
            // Also update details status? Usually details follow header status.
            $updateDetails = "UPDATE tbl_kot_details SET kot_details_status = $kot_status
                              WHERE kot_details_kot_id = $kot_id AND is_deleted = 1";
            mysqli_query($sql, $updateDetails);

            logMessage('kot', "KOT $kot_id status updated to $kot_status", 'INFO');
            http_response_code(200);
            $response = ['status' => 'success', 'message' => 'Status updated'];
        } else {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Update failed: ' . mysqli_error($sql)];
        }
        break;
    }

    // 4. Get single KOT details (for billing/display)
    case 4: {
        if (empty($kot_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'KOT ID required'];
            break;
        }
        $query = "SELECT k.*, 
                         (SELECT GROUP_CONCAT(CONCAT(kd.kot_details_product_id, ':', kd.kot_details_qty, ':', kd.kot_details_special_instraction)) 
                          FROM tbl_kot_details kd WHERE kd.kot_details_kot_id = k.kot_id AND kd.is_deleted = 1) as items_detail
                  FROM tbl_kot k
                  WHERE k.kot_id = $kot_id AND k.company_id = '$company_id' AND k.franchise_id = '$franchise_id' AND k.is_deleted = 1";
        $result = mysqli_query($sql, $query);
        if ($result && $row = mysqli_fetch_assoc($result)) {
            http_response_code(200);
            $response = ['status' => 'success', 'data' => $row];
        } else {
            http_response_code(404);
            $response = ['status' => 'error', 'message' => 'KOT not found'];
        }
        break;
    }

    default:
        http_response_code(400);
        $response = ['status' => 'error', 'message' => 'Invalid type'];
        logError('kot', "Invalid type: $type");
}

logResponse('kot', $response);
echo json_encode($response);
mysqli_close($sql);