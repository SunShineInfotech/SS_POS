<?php
// v1_api/product.php
require_once 'dbconnection.php';

if (isset($GLOBALS['_RAW_INPUT'])) {
    $postData = json_decode($GLOBALS['_RAW_INPUT'], true);
} else {
    $postData = json_decode(file_get_contents('php://input'), true);
}

logRequest('product', $postData);

if (empty($postData)) {
    http_response_code(400);
    $response = ['status' => 'error', 'message' => 'No data received'];
    logResponse('product', $response);
    echo json_encode($response);
    exit;
}

$type = isset($postData['type']) ? intval($postData['type']) : 0;

// Escape all input for security
$company_id   = isset($postData['company_id']) ? mysqli_real_escape_string($sql, trim($postData['company_id'])) : '';
$franchise_id = isset($postData['franchise_id']) ? mysqli_real_escape_string($sql, trim($postData['franchise_id'])) : '';
$product_id   = isset($postData['product_id']) ? intval($postData['product_id']) : 0;

// Only columns that exist in the table
$cat_id        = isset($postData['product_cat_id']) ? intval($postData['product_cat_id']) : 0;
$name          = isset($postData['product_name']) ? mysqli_real_escape_string($sql, trim($postData['product_name'])) : '';
$base_price    = isset($postData['product_base_price']) ? floatval($postData['product_base_price']) : 0;
$cgst          = isset($postData['product_cgst']) ? floatval($postData['product_cgst']) : 0;
$sgst          = isset($postData['product_sgst']) ? floatval($postData['product_sgst']) : 0;
$igst          = isset($postData['product_igst']) ? floatval($postData['product_igst']) : 0;
$mrp_with_gst  = isset($postData['product_mrp_with_gst']) ? floatval($postData['product_mrp_with_gst']) : 0;
$final_amount  = isset($postData['product_final_amount']) ? floatval($postData['product_final_amount']) : 0;

// MRP is always derived server-side: Base Price + CGST% + SGST% of base
// (keeps DB correct even if the client sends a stale/wrong value)
$cgst_amount   = round($base_price * $cgst / 100, 2);
$sgst_amount   = round($base_price * $sgst / 100, 2);
$mrp_with_gst  = round($base_price + $cgst_amount + $sgst_amount, 2);
$hsn_code      = isset($postData['product_hsn_code']) ? mysqli_real_escape_string($sql, trim($postData['product_hsn_code'])) : '';
$sku           = isset($postData['product_sku']) ? mysqli_real_escape_string($sql, trim($postData['product_sku'])) : '';
$is_active     = isset($postData['product_is_active']) ? intval($postData['product_is_active']) : 1;
$weight        = isset($postData['product_weight']) ? mysqli_real_escape_string($sql, trim($postData['product_weight'])) : '';
$stock         = isset($postData['product_stock']) ? floatval($postData['product_stock']) : 0;
$prod_type     = isset($postData['product_type']) ? intval($postData['product_type']) : 1;

$image_base64  = isset($postData['product_image']) ? $postData['product_image'] : '';

$response = ['status' => 'error', 'message' => 'Invalid request'];
http_response_code(400);

// ----- Helper: Save base64 image to disk -----
function saveProductImage($upload_product_url,$base64Data, $existingPath = '') {
    global $upload_product_url; // defined in dbconnection.php as '../uploadfiles/product/'

    if (empty($base64Data)) {
        return $existingPath;
    }
    if (strpos($base64Data, 'data:image') !== 0) {
        return $base64Data;
    }

    if (preg_match('/^data:image\/(\w+);base64,/', $base64Data, $matches)) {
        $ext = strtolower($matches[1]);
        $allowed = ['jpg', 'jpeg', 'png', 'webp'];
        if (!in_array($ext, $allowed)) {
            return $existingPath;
        }

        $data = substr($base64Data, strpos($base64Data, ',') + 1);
        $data = base64_decode($data);
        if ($data === false) {
            return $existingPath;
        }

        if (!is_dir($upload_product_url)) {
            mkdir($upload_product_url, 0755, true);
        }

        $fileName = 'prod_' . uniqid() . '.' . $ext;
        if (file_put_contents($upload_product_url . $fileName, $data)) {
            return 'uploadfiles/product/' . $fileName;
        }
    }
    return $existingPath;
}

switch ($type) {

    // ----- 1. Insert new product -----
    case 1: {
        if (empty($company_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }
        if (empty($name)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Product name is required'];
            break;
        }

        // Check duplicate SKU (if provided)
        if (!empty($sku)) {
            $checkQuery = "SELECT product_id FROM tbl_product
                           WHERE company_id = '$company_id'
                             AND franchise_id = '$franchise_id'
                             AND product_sku = '$sku'
                             AND is_deleted = '1'";
            $checkResult = mysqli_query($sql, $checkQuery);
            if ($checkResult && mysqli_num_rows($checkResult) > 0) {
                http_response_code(409);
                $response = ['status' => 'error', 'message' => 'A product with this SKU already exists'];
                break;
            }
        }

        $image_path = saveProductImage($upload_product_url,$image_base64);

        $query = "INSERT INTO tbl_product (
                    company_id, franchise_id, product_cat_id,
                    product_name, product_image, product_base_price,
                    product_cgst, product_sgst, product_igst,
                    product_mrp_with_gst, product_final_amount,
                    product_hsn_code, product_sku,
                    product_is_active, product_weight, product_stock,
                    product_type, is_deleted, c_date
                  ) VALUES (
                    '$company_id', '$franchise_id', '$cat_id',
                    '$name', '$image_path', '$base_price',
                    '$cgst', '$sgst', '$igst',
                    '$mrp_with_gst', '$final_amount',
                    '$hsn_code', '$sku',
                    '$is_active', '$weight', '$stock',
                    '$prod_type', '1', NOW()
                  )";

        if (mysqli_query($sql, $query)) {
            $new_id = mysqli_insert_id($sql);
            logMessage('product', "New product added: $name (ID: $new_id)", 'INFO');
            http_response_code(201);
            $response = [
                'status' => 'success',
                'message' => 'Product added successfully',
                'product_id' => $new_id
            ];
        } else {
            $error = mysqli_error($sql);
            logError('product', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to add product: ' . $error];
        }
        break;
    }

    // ----- 2. Get all products (with category name) -----
    case 2: {
        if (empty($company_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }
        if (empty($franchise_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Franchise ID is required'];
            break;
        }

        $query = "SELECT
                    tblp.product_id, tblp.company_id, tblp.franchise_id,
                    tblp.product_cat_id,
                    tblp.product_name, tblp.product_image,
                    tblp.product_base_price, tblp.product_cgst, tblp.product_sgst,
                    tblp.product_igst, tblp.product_mrp_with_gst, tblp.product_final_amount,
                    tblp.product_hsn_code, tblp.product_sku,
                    tblp.product_is_active, tblp.product_weight, tblp.product_stock,
                    tblp.product_type, tblp.is_deleted, tblp.c_date, tblp.u_date,
                    tblc.category_name, tblc.category_status
                  FROM tbl_product AS tblp
                  LEFT JOIN tbl_category AS tblc ON tblc.category_id = tblp.product_cat_id
                  WHERE tblp.company_id = '$company_id'
                    AND tblp.franchise_id = '$franchise_id'
                    AND tblp.is_deleted = '1'
                  ORDER BY tblp.c_date DESC";

        $result = mysqli_query($sql, $query);

        if ($result) {
            $products = [];
            while ($row = mysqli_fetch_assoc($result)) {
                $row['product_image'] =$server_url.$row['product_image'];
                $products[] = $row;
            }
            logMessage('product', "Fetched " . count($products) . " products", 'INFO');
            http_response_code(200);
            $response = [
                'status' => 'success',
                'message' => 'Products fetched successfully',
                'data' => $products,
                'total' => count($products)
            ];
        } else {
            $error = mysqli_error($sql);
            logError('product', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to fetch products: ' . $error];
        }
        break;
    }

    // ----- 3. Update product -----
    case 3: {
        if (empty($product_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Product ID is required'];
            break;
        }
        if (empty($company_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }
        if (empty($name)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Product name is required'];
            break;
        }

        // Check duplicate SKU (exclude current)
        if (!empty($sku)) {
            $checkQuery = "SELECT product_id FROM tbl_product
                           WHERE company_id = '$company_id'
                             AND franchise_id = '$franchise_id'
                             AND product_sku = '$sku'
                             AND is_deleted = '1'
                             AND product_id != '$product_id'";
            $checkResult = mysqli_query($sql, $checkQuery);
            if ($checkResult && mysqli_num_rows($checkResult) > 0) {
                http_response_code(409);
                $response = ['status' => 'error', 'message' => 'A product with this SKU already exists'];
                break;
            }
        }

        // Fetch existing image path if any
        $existingImage = '';
        $existQuery = "SELECT product_image FROM tbl_product WHERE product_id = '$product_id'";
        $existResult = mysqli_query($sql, $existQuery);
        if ($existResult && mysqli_num_rows($existResult) > 0) {
            $existingImage = mysqli_fetch_assoc($existResult)['product_image'];
        }
        $image_path = saveProductImage($upload_product_url,$image_base64, $existingImage);

        $query = "UPDATE tbl_product SET
                    product_cat_id = '$cat_id',
                    product_name = '$name',
                    product_image = '$image_path',
                    product_base_price = '$base_price',
                    product_cgst = '$cgst',
                    product_sgst = '$sgst',
                    product_igst = '$igst',
                    product_mrp_with_gst = '$mrp_with_gst',
                    product_final_amount = '$final_amount',
                    product_hsn_code = '$hsn_code',
                    product_sku = '$sku',
                    product_is_active = '$is_active',
                    product_weight = '$weight',
                    product_stock = '$stock',
                    product_type = '$prod_type',
                    u_date = NOW()
                  WHERE product_id = '$product_id'
                    AND company_id = '$company_id'
                    AND franchise_id = '$franchise_id'
                    AND is_deleted = '1'";

        if (mysqli_query($sql, $query)) {
            if (mysqli_affected_rows($sql) === 0) {
                // Check if product still exists (maybe no changes)
                $existsCheck = "SELECT product_id FROM tbl_product
                                WHERE product_id = '$product_id'
                                  AND company_id = '$company_id'
                                  AND franchise_id = '$franchise_id'
                                  AND is_deleted = '1'";
                $existsResult = mysqli_query($sql, $existsCheck);
                if ($existsResult && mysqli_num_rows($existsResult) > 0) {
                    http_response_code(200);
                    $response = ['status' => 'success', 'message' => 'No changes to save'];
                } else {
                    http_response_code(404);
                    $response = ['status' => 'error', 'message' => 'Product not found'];
                }
            } else {
                logMessage('product', "Product updated: $name (ID: $product_id)", 'INFO');
                http_response_code(200);
                $response = ['status' => 'success', 'message' => 'Product updated successfully'];
            }
        } else {
            $error = mysqli_error($sql);
            logError('product', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to update product: ' . $error];
        }
        break;
    }

    // ----- 4. Soft delete product -----
    case 4: {
        if (empty($product_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Product ID is required'];
            break;
        }
        if (empty($company_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }

        $query = "UPDATE tbl_product
                  SET is_deleted = '0'
                  WHERE product_id = '$product_id'
                    AND company_id = '$company_id'
                    AND franchise_id = '$franchise_id'";

        if (mysqli_query($sql, $query)) {
            if (mysqli_affected_rows($sql) === 0) {
                http_response_code(404);
                $response = ['status' => 'error', 'message' => 'Product not found'];
            } else {
                logMessage('product', "Product deleted (ID: $product_id)", 'INFO');
                http_response_code(200);
                $response = ['status' => 'success', 'message' => 'Product deleted successfully'];
            }
        } else {
            $error = mysqli_error($sql);
            logError('product', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to delete product: ' . $error];
        }
        break;
    }

    // ----- 5. Get single product by ID -----
    case 5: {
        if (empty($product_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Product ID is required'];
            break;
        }
        if (empty($company_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }

        $query = "SELECT * FROM tbl_product
                  WHERE product_id = '$product_id'
                    AND company_id = '$company_id'
                    AND franchise_id = '$franchise_id'
                    AND is_deleted = '1'";
        $result = mysqli_query($sql, $query);

        if ($result && mysqli_num_rows($result) > 0) {
            $row = mysqli_fetch_assoc($result);
            http_response_code(200);
            $response = ['status' => 'success', 'message' => 'Product fetched successfully', 'data' => $row];
        } else {
            http_response_code(404);
            $response = ['status' => 'error', 'message' => 'Product not found'];
        }
        break;
    }

    // ----- 6. Get all products for POS Display (with category name - Here, we show only those items whoses products type is equal to 1 which is sales) -----
    case 6: {
        if (empty($company_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }
        if (empty($franchise_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Franchise ID is required'];
            break;
        }

        $query = "SELECT
                    tblp.product_id, tblp.company_id, tblp.franchise_id,
                    tblp.product_cat_id,
                    tblp.product_name, tblp.product_image,
                    tblp.product_base_price, tblp.product_cgst, tblp.product_sgst,
                    tblp.product_igst, tblp.product_mrp_with_gst, tblp.product_final_amount,
                    tblp.product_hsn_code, tblp.product_sku,
                    tblp.product_is_active, tblp.product_weight, tblp.product_stock,
                    tblp.product_type, tblp.is_deleted, tblp.c_date, tblp.u_date,
                    tblc.category_name, tblc.category_status
                  FROM tbl_product AS tblp
                  LEFT JOIN tbl_category AS tblc ON tblc.category_id = tblp.product_cat_id
                  WHERE tblp.company_id = '$company_id'
                    AND tblp.franchise_id = '$franchise_id'
                    AND tblp.is_deleted = '1'
                    AND tblp.product_type = 1
                  ORDER BY tblp.c_date DESC";

        $result = mysqli_query($sql, $query);

        if ($result) {
            $products = [];
            while ($row = mysqli_fetch_assoc($result)) {
                $row['product_image'] =$server_url.$row['product_image'];
                $products[] = $row;
            }
            logMessage('product', "Fetched " . count($products) . " products", 'INFO');
            http_response_code(200);
            $response = [
                'status' => 'success',
                'message' => 'Products fetched successfully',
                'data' => $products,
                'total' => count($products)
            ];
        } else {
            $error = mysqli_error($sql);
            logError('product', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to fetch products: ' . $error];
        }
        break;
    }
    
    
    // ----- 7. Get all products for Purchase Display (Here, we show only those items whoses products type is equal to 2 which is Purchase) -----
    case 7: {
        if (empty($company_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company ID is required'];
            break;
        }
        if (empty($franchise_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Franchise ID is required'];
            break;
        }

        $query = "SELECT
                    tblp.product_id, tblp.company_id, tblp.franchise_id,
                    tblp.product_cat_id,
                    tblp.product_name, tblp.product_image,
                    tblp.product_base_price, tblp.product_cgst, tblp.product_sgst,
                    tblp.product_igst, tblp.product_mrp_with_gst, tblp.product_final_amount,
                    tblp.product_hsn_code, tblp.product_sku,
                    tblp.product_is_active, tblp.product_weight, tblp.product_stock,
                    tblp.product_type, tblp.is_deleted, tblp.c_date, tblp.u_date,
                    tblc.category_name, tblc.category_status
                  FROM tbl_product AS tblp
                  LEFT JOIN tbl_category AS tblc ON tblc.category_id = tblp.product_cat_id
                  WHERE tblp.company_id = '$company_id'
                    AND tblp.franchise_id = '$franchise_id'
                    AND tblp.is_deleted = '1'
                    AND tblp.product_type IN (2, 3)
                  ORDER BY tblp.c_date DESC";

        $result = mysqli_query($sql, $query);

        if ($result) {
            $products = [];
            while ($row = mysqli_fetch_assoc($result)) {
                $row['product_image'] =$server_url.$row['product_image'];
                $products[] = $row;
            }
            logMessage('product', "Fetched " . count($products) . " products", 'INFO');
            http_response_code(200);
            $response = [
                'status' => 'success',
                'message' => 'Products fetched successfully',
                'data' => $products,
                'total' => count($products)
            ];
        } else {
            $error = mysqli_error($sql);
            logError('product', $error);
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to fetch products: ' . $error];
        }
        break;
    }
    
    default:
        http_response_code(400);
        $response = ['status' => 'error', 'message' => 'Invalid request type'];
        logError('product', "Invalid request type: $type");
}

logResponse('product', $response);
echo json_encode($response);
mysqli_close($sql);
?>