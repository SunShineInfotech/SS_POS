<?php
// v1_api/category.php
require_once 'dbconnection.php';

if (isset($GLOBALS['_RAW_INPUT'])) {
    $postData = json_decode($GLOBALS['_RAW_INPUT'], true);
} else {
    $postData = json_decode(file_get_contents('php://input'), true);
}

logRequest('category', $postData);

if (empty($postData)) {
    http_response_code(400);
    $response = ['status' => 'error', 'message' => 'No data received'];
    logResponse('category', $response);
    echo json_encode($response);
    exit;
}

$type             = isset($postData['type']) ? intval($postData['type']) : 0;
$company_id       = isset($postData['company_id']) ? trim($postData['company_id']) : '';
$franchise_id     = isset($postData['franchise_id']) ? trim($postData['franchise_id']) : '';
$category_name    = isset($postData['category_name']) ? trim($postData['category_name']) : '';
$category_status  = isset($postData['category_status']) ? intval($postData['category_status']) : 1;

/**
 * Run a prepared statement safely. Returns a mysqli_result on SELECT,
 * ['insert_id'=>..,'affected_rows'=>..] on INSERT/UPDATE/DELETE, or false
 * on any failure (logged server-side, never exposed to the client).
 */
function runPrepared($conn, $query, $types, $params, $apiName = 'category') {
    $stmt = mysqli_prepare($conn, $query);
    if ($stmt === false) {
        logError($apiName, 'Prepare failed: ' . mysqli_error($conn));
        return false;
    }
    if ($types !== '' && !empty($params)) {
        mysqli_stmt_bind_param($stmt, $types, ...$params);
    }
    if (!mysqli_stmt_execute($stmt)) {
        logError($apiName, 'Execute failed: ' . mysqli_stmt_error($stmt));
        mysqli_stmt_close($stmt);
        return false;
    }
    $result = mysqli_stmt_get_result($stmt);
    if ($result === false) {
        // No result set (INSERT/UPDATE/DELETE) — still a success.
        $insertId = mysqli_stmt_insert_id($stmt);
        $affected = mysqli_stmt_affected_rows($stmt);
        mysqli_stmt_close($stmt);
        return ['insert_id' => $insertId, 'affected_rows' => $affected];
    }
    mysqli_stmt_close($stmt);
    return $result;
}

$response = ['status' => 'error', 'message' => 'Invalid request'];
http_response_code(400);

switch ($type) {

    // ----- 1. Insert -----
    case 1: {
        if (empty($company_id) || empty($category_name)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company ID and category name are required'];
            break;
        }

        // Duplicate check
        $check = "SELECT category_id FROM tbl_category
                  WHERE company_id = ? AND category_name = ? AND franchise_id = ? AND is_deleted = '1'";
        $checkResult = runPrepared($sql, $check, 'sss', [$company_id, $category_name, $franchise_id]);
        if ($checkResult === false) {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to check for duplicates'];
            break;
        }
        if (mysqli_num_rows($checkResult) > 0) {
            http_response_code(409);
            $response = ['status' => 'error', 'message' => 'Category already exists'];
            break;
        }

        $query = "INSERT INTO tbl_category
                  (company_id, category_name, franchise_id, category_status, is_deleted, c_date)
                  VALUES (?, ?, ?, ?, '1', NOW())";
        $result = runPrepared($sql, $query, 'sssi', [$company_id, $category_name, $franchise_id, $category_status]);

        if ($result !== false) {
            logMessage('category', "New category added: $category_name (ID: {$result['insert_id']})", 'INFO');
            http_response_code(201);
            $response = [
                'status' => 'success',
                'message' => 'Category added successfully',
                'category_id' => $result['insert_id']
            ];
        } else {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to add category'];
        }
        break;
    }

    // ----- 2. Get all (list) -----
    case 2: {
        if (empty($company_id) || empty($franchise_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company and franchise IDs are required'];
            break;
        }

        $query = "SELECT category_id, company_id, franchise_id, category_name, category_status, is_deleted, c_date, u_date
                  FROM tbl_category
                  WHERE company_id = ? AND franchise_id = ? AND is_deleted = '1'
                  ORDER BY c_date DESC";
        $result = runPrepared($sql, $query, 'ss', [$company_id, $franchise_id]);

        if ($result !== false) {
            $categories = [];
            while ($row = mysqli_fetch_assoc($result)) {
                $categories[] = $row;
            }
            logMessage('category', "Fetched " . count($categories) . " categories", 'INFO');
            http_response_code(200);
            $response = [
                'status' => 'success',
                'message' => 'Categories fetched successfully',
                'data' => $categories,
                'total' => count($categories)
            ];
        } else {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to fetch categories'];
        }
        break;
    }

    // ----- 3. Update -----
    case 3: {
        $category_id = isset($postData['category_id']) ? intval($postData['category_id']) : 0;
        if (empty($category_id) || empty($company_id) || empty($category_name)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Category ID, company ID, and name are required'];
            break;
        }

        // Duplicate check (exclude current)
        $check = "SELECT category_id FROM tbl_category
                  WHERE company_id = ? AND category_name = ? AND franchise_id = ?
                    AND is_deleted = '1' AND category_id != ?";
        $checkResult = runPrepared($sql, $check, 'sssi', [$company_id, $category_name, $franchise_id, $category_id]);
        if ($checkResult === false) {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to check for duplicates'];
            break;
        }
        if (mysqli_num_rows($checkResult) > 0) {
            http_response_code(409);
            $response = ['status' => 'error', 'message' => 'Category already exists'];
            break;
        }

        $query = "UPDATE tbl_category
                  SET category_name = ?, category_status = ?, u_date = NOW()
                  WHERE category_id = ? AND company_id = ? AND franchise_id = ? AND is_deleted = '1'";
        $result = runPrepared($sql, $query, 'siiss', [$category_name, $category_status, $category_id, $company_id, $franchise_id]);

        if ($result !== false) {
            if ($result['affected_rows'] === 0) {
                // Query succeeded but matched nothing — either the record
                // doesn't exist or the name/status were already identical.
                // Check existence separately so "no change" isn't reported
                // as "not found".
                $exists = runPrepared(
                    $sql,
                    "SELECT category_id FROM tbl_category WHERE category_id = ? AND company_id = ? AND franchise_id = ? AND is_deleted = '1'",
                    'iss',
                    [$category_id, $company_id, $franchise_id]
                );
                if ($exists !== false && mysqli_num_rows($exists) > 0) {
                    http_response_code(200);
                    $response = ['status' => 'success', 'message' => 'No changes to save'];
                } else {
                    http_response_code(404);
                    $response = ['status' => 'error', 'message' => 'Category not found'];
                }
            } else {
                logMessage('category', "Category updated: $category_name (ID: $category_id)", 'INFO');
                http_response_code(200);
                $response = ['status' => 'success', 'message' => 'Category updated successfully'];
            }
        } else {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to update category'];
        }
        break;
    }

    // ----- 4. Soft delete -----
    case 4: {
        $category_id = isset($postData['category_id']) ? intval($postData['category_id']) : 0;
        if (empty($category_id) || empty($company_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Category ID and company ID are required'];
            break;
        }

        $query = "UPDATE tbl_category
                  SET is_deleted = '0'
                  WHERE category_id = ? AND company_id = ? AND franchise_id = ?";
        $result = runPrepared($sql, $query, 'iss', [$category_id, $company_id, $franchise_id]);

        if ($result !== false) {
            if ($result['affected_rows'] === 0) {
                http_response_code(404);
                $response = ['status' => 'error', 'message' => 'Category not found'];
            } else {
                logMessage('category', "Category deleted (ID: $category_id)", 'INFO');
                http_response_code(200);
                $response = ['status' => 'success', 'message' => 'Category deleted successfully'];
            }
        } else {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to delete category'];
        }
        break;
    }

    // ----- 5. Get single -----
    case 5: {
        $category_id = isset($postData['category_id']) ? intval($postData['category_id']) : 0;
        if (empty($category_id) || empty($company_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Category ID and company ID are required'];
            break;
        }

        $query = "SELECT category_id, company_id, franchise_id, category_name, category_status, is_deleted, c_date, u_date
                  FROM tbl_category
                  WHERE category_id = ? AND company_id = ? AND franchise_id = ? AND is_deleted = '1'";
        $result = runPrepared($sql, $query, 'iss', [$category_id, $company_id, $franchise_id]);

        if ($result !== false && mysqli_num_rows($result) > 0) {
            $row = mysqli_fetch_assoc($result);
            http_response_code(200);
            $response = [
                'status' => 'success',
                'message' => 'Category fetched successfully',
                'data' => $row
            ];
        } elseif ($result === false) {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to fetch category'];
        } else {
            http_response_code(404);
            $response = ['status' => 'error', 'message' => 'Category not found'];
        }
        break;
    }

    default:
        http_response_code(400);
        $response = ['status' => 'error', 'message' => 'Invalid request type'];
        logError('category', "Invalid request type: $type");
}

logResponse('category', $response);
echo json_encode($response);
mysqli_close($sql);