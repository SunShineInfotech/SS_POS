<?php
require_once 'dbconnection.php';

if (isset($GLOBALS['_RAW_INPUT'])) {
    $postData = json_decode($GLOBALS['_RAW_INPUT'], true);
} else {
    $postData = json_decode(file_get_contents('php://input'), true);
}

logRequest('cart', $postData);

if (empty($postData)) {
    http_response_code(400);
    $response = ['status' => 'error', 'message' => 'No data received'];
    logResponse('cart', $response);
    echo json_encode($response);
    exit;
}

$type          = isset($postData['type']) ? intval($postData['type']) : 0;
$company_id    = isset($postData['company_id']) ? mysqli_real_escape_string($sql, trim($postData['company_id'])) : '';
$franchise_id  = isset($postData['franchise_id']) ? mysqli_real_escape_string($sql, trim($postData['franchise_id'])) : '';
$table_id      = isset($postData['table_id']) ? intval($postData['table_id']) : 0;
$customer_name = isset($postData['customer_name']) ? mysqli_real_escape_string($sql, trim($postData['customer_name'])) : '';
$customer_mobile = isset($postData['customer_mobile']) ? mysqli_real_escape_string($sql, trim($postData['customer_mobile'])) : '';
$discount_type = isset($postData['discount_type']) ? mysqli_real_escape_string($sql, trim($postData['discount_type'])) : '%';
$discount_value= isset($postData['discount_value']) ? floatval($postData['discount_value']) : 0;
$items         = isset($postData['items']) ? $postData['items'] : []; // array of {product_id, qty}

$response = ['status' => 'error', 'message' => 'Invalid request'];
http_response_code(400);

switch ($type) {

    // 1. Save/Update cart (replace all items for table)
    case 1: {
        if (empty($company_id) || empty($franchise_id) || empty($table_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company, franchise and table are required'];
            break;
        }

        // Delete existing cart for this table
        $del = "DELETE FROM tbl_cart WHERE company_id = '$company_id' AND franchise_id = '$franchise_id' AND cart_table_id = $table_id";
        if (!mysqli_query($sql, $del)) {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to clear old cart: ' . mysqli_error($sql)];
            break;
        }

        // Insert new items
        $inserted = 0;
        foreach ($items as $item) {
            $product_id = intval($item['product_id']);
            $qty = intval($item['qty']);
            if ($qty <= 0) continue;

            $query = "INSERT INTO tbl_cart
                      (company_id, franchise_id, cart_table_id, cart_product_id, product_quantity,
                       cart_customer_name, cart_customer_number, is_deleted, c_date)
                      VALUES ('$company_id', '$franchise_id', $table_id, $product_id, $qty,
                              '$customer_name', '$customer_mobile', 1, NOW())";
            if (mysqli_query($sql, $query)) {
                $inserted++;
            } else {
                logError('cart', 'Insert failed: ' . mysqli_error($sql));
            }
        }

        logMessage('cart', "Cart saved: $inserted items for table $table_id", 'INFO');
        http_response_code(200);
        $response = ['status' => 'success', 'message' => "Cart saved ($inserted items)"];
        break;
    }

    // 2. Get cart for table
    case 2: {
        if (empty($company_id) || empty($franchise_id) || empty($table_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Missing parameters'];
            break;
        }

        $query = "SELECT cart_product_id as product_id, product_quantity as qty,
                         cart_customer_name, cart_customer_number
                  FROM tbl_cart
                  WHERE company_id = '$company_id' AND franchise_id = '$franchise_id'
                    AND cart_table_id = $table_id AND is_deleted = 1";
        $result = mysqli_query($sql, $query);
        if ($result) {
            $items = [];
            $customer = ['name' => '', 'mobile' => ''];
            while ($row = mysqli_fetch_assoc($result)) {
                $items[] = ['product_id' => intval($row['product_id']), 'qty' => intval($row['qty'])];
                if ($row['cart_customer_name']) $customer['name'] = $row['cart_customer_name'];
                if ($row['cart_customer_number']) $customer['mobile'] = $row['cart_customer_number'];
            }
            http_response_code(200);
            $response = [
                'status' => 'success',
                'data' => ['items' => $items, 'customer' => $customer]
            ];
        } else {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Fetch failed: ' . mysqli_error($sql)];
        }
        break;
    }

    // 3. Clear cart
    case 3: {
        if (empty($company_id) || empty($franchise_id) || empty($table_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Missing parameters'];
            break;
        }
        $del = "DELETE FROM tbl_cart WHERE company_id = '$company_id' AND franchise_id = '$franchise_id' AND cart_table_id = $table_id";
        if (mysqli_query($sql, $del)) {
            http_response_code(200);
            $response = ['status' => 'success', 'message' => 'Cart cleared'];
        } else {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Clear failed: ' . mysqli_error($sql)];
        }
        break;
    }

    default:
        http_response_code(400);
        $response = ['status' => 'error', 'message' => 'Invalid type'];
        logError('cart', "Invalid type: $type");
}

logResponse('cart', $response);
echo json_encode($response);
mysqli_close($sql);