<?php
require_once 'dbconnection.php';

// Read JSON input
if (isset($GLOBALS['_RAW_INPUT'])) {
    $postData = json_decode($GLOBALS['_RAW_INPUT'], true);
} else {
    $postData = json_decode(file_get_contents('php://input'), true);
}

logRequest('expense_category', $postData);

if (empty($postData)) {
    http_response_code(400);
    $response = ['status' => 'error', 'message' => 'No data received'];
    logResponse('expense_category', $response);
    echo json_encode($response);
    exit;
}

// --- Extract parameters ---
$type          = isset($postData['type']) ? intval($postData['type']) : 0;
$company_id    = isset($postData['company_id']) ? mysqli_real_escape_string($sql, trim($postData['company_id'])) : '';
$franchise_id  = isset($postData['franchise_id']) ? mysqli_real_escape_string($sql, trim($postData['franchise_id'])) : '';
$category_id   = isset($postData['expenses_categories_id']) ? intval($postData['expenses_categories_id']) : 0;
$title         = isset($postData['expenses_categories_title']) ? mysqli_real_escape_string($sql, trim($postData['expenses_categories_title'])) : '';

$response = ['status' => 'error', 'message' => 'Invalid request'];
http_response_code(400);

switch ($type) {

    // 1. Insert (unchanged)
    case 1: {
        if (empty($company_id) || empty($franchise_id) || empty($title)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company, franchise and title are required'];
            break;
        }

        $check = "SELECT expenses_categories_id FROM tbl_expenses_categories
                  WHERE company_id = '$company_id' AND franchise_id = '$franchise_id'
                    AND expenses_categories_title = '$title' AND is_deleted = 1";
        $checkResult = mysqli_query($sql, $check);
        if (!$checkResult) {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Duplicate check failed: ' . mysqli_error($sql)];
            break;
        }
        if (mysqli_num_rows($checkResult) > 0) {
            http_response_code(409);
            $response = ['status' => 'error', 'message' => 'Category already exists'];
            break;
        }

        $query = "INSERT INTO tbl_expenses_categories
                  (company_id, franchise_id, expenses_categories_title, is_deleted, c_date)
                  VALUES ('$company_id', '$franchise_id', '$title', 1, NOW())";
        if (mysqli_query($sql, $query)) {
            $newId = mysqli_insert_id($sql);
            logMessage('expense_category', "New category: $title (ID: $newId)", 'INFO');
            http_response_code(201);
            $response = [
                'status' => 'success',
                'message' => 'Expense category added',
                'expenses_categories_id' => $newId
            ];
        } else {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to add category: ' . mysqli_error($sql)];
        }
        break;
    }

    // 2. List – removed u_date
    case 2: {
        if (empty($company_id) || empty($franchise_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company and franchise IDs required'];
            break;
        }

        $query = "SELECT expenses_categories_id, company_id, franchise_id, expenses_categories_title,
                         is_deleted, c_date
                  FROM tbl_expenses_categories
                  WHERE company_id = '$company_id' AND franchise_id = '$franchise_id' AND is_deleted = 1
                  ORDER BY expenses_categories_title ASC";
        $result = mysqli_query($sql, $query);
        if ($result) {
            $categories = [];
            while ($row = mysqli_fetch_assoc($result)) {
                $categories[] = $row;
            }
            http_response_code(200);
            $response = [
                'status' => 'success',
                'message' => 'Categories fetched',
                'data' => $categories,
                'total' => count($categories)
            ];
        } else {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to fetch categories: ' . mysqli_error($sql)];
        }
        break;
    }

    // 3. Update (unchanged – doesn't select u_date)
    case 3: {
        if (empty($category_id) || empty($company_id) || empty($franchise_id) || empty($title)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'All fields required'];
            break;
        }

        $check = "SELECT expenses_categories_id FROM tbl_expenses_categories
                  WHERE company_id = '$company_id' AND franchise_id = '$franchise_id'
                    AND expenses_categories_title = '$title' AND is_deleted = 1
                    AND expenses_categories_id != $category_id";
        $checkResult = mysqli_query($sql, $check);
        if (!$checkResult) {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Duplicate check failed: ' . mysqli_error($sql)];
            break;
        }
        if (mysqli_num_rows($checkResult) > 0) {
            http_response_code(409);
            $response = ['status' => 'error', 'message' => 'Category already exists'];
            break;
        }

        $query = "UPDATE tbl_expenses_categories
                  SET expenses_categories_title = '$title'
                  WHERE expenses_categories_id = $category_id
                    AND company_id = '$company_id'
                    AND franchise_id = '$franchise_id'
                    AND is_deleted = 1";
        if (mysqli_query($sql, $query)) {
            $affected = mysqli_affected_rows($sql);
            if ($affected === 0) {
                $exists = mysqli_query($sql, "SELECT expenses_categories_id FROM tbl_expenses_categories
                                              WHERE expenses_categories_id = $category_id
                                                AND company_id = '$company_id'
                                                AND franchise_id = '$franchise_id'
                                                AND is_deleted = 1");
                if ($exists && mysqli_num_rows($exists) > 0) {
                    http_response_code(200);
                    $response = ['status' => 'success', 'message' => 'No changes to save'];
                } else {
                    http_response_code(404);
                    $response = ['status' => 'error', 'message' => 'Category not found'];
                }
            } else {
                logMessage('expense_category', "Category updated: $title (ID: $category_id)", 'INFO');
                http_response_code(200);
                $response = ['status' => 'success', 'message' => 'Category updated'];
            }
        } else {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Update failed: ' . mysqli_error($sql)];
        }
        break;
    }

    // 4. Soft delete (unchanged)
    case 4: {
        if (empty($category_id) || empty($company_id) || empty($franchise_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Missing parameters'];
            break;
        }

        $query = "UPDATE tbl_expenses_categories SET is_deleted = 0
                  WHERE expenses_categories_id = $category_id
                    AND company_id = '$company_id'
                    AND franchise_id = '$franchise_id'";
        if (mysqli_query($sql, $query)) {
            if (mysqli_affected_rows($sql) === 0) {
                http_response_code(404);
                $response = ['status' => 'error', 'message' => 'Category not found'];
            } else {
                logMessage('expense_category', "Category deleted (ID: $category_id)", 'INFO');
                http_response_code(200);
                $response = ['status' => 'success', 'message' => 'Category deleted'];
            }
        } else {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Delete failed: ' . mysqli_error($sql)];
        }
        break;
    }

    // 5. Get single – removed u_date
    case 5: {
        if (empty($category_id) || empty($company_id) || empty($franchise_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Missing parameters'];
            break;
        }

        $query = "SELECT expenses_categories_id, company_id, franchise_id, expenses_categories_title,
                         is_deleted, c_date
                  FROM tbl_expenses_categories
                  WHERE expenses_categories_id = $category_id
                    AND company_id = '$company_id'
                    AND franchise_id = '$franchise_id'
                    AND is_deleted = 1";
        $result = mysqli_query($sql, $query);
        if ($result && mysqli_num_rows($result) > 0) {
            $row = mysqli_fetch_assoc($result);
            http_response_code(200);
            $response = ['status' => 'success', 'data' => $row];
        } elseif (!$result) {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Fetch failed: ' . mysqli_error($sql)];
        } else {
            http_response_code(404);
            $response = ['status' => 'error', 'message' => 'Category not found'];
        }
        break;
    }

    default:
        http_response_code(400);
        $response = ['status' => 'error', 'message' => 'Invalid type'];
        logError('expense_category', "Invalid type: $type");
}

logResponse('expense_category', $response);
echo json_encode($response);
mysqli_close($sql);