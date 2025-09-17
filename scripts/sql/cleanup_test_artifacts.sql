-- Cleanup likely test data created during isolation tests
-- Review first by running SELECT queries below, then uncomment DELETEs as needed.

-- Branches created by tests
SELECT * FROM branches WHERE name IN ('Branch A','Branch B');
-- DELETE FROM branches WHERE name IN ('Branch A','Branch B');

-- Users created by tests
SELECT id, username, email, branch_id FROM users WHERE username LIKE 'userA_%' OR username LIKE 'userB_%';
-- DELETE FROM users WHERE username LIKE 'userA_%' OR username LIKE 'userB_%';

-- Categories created by tests
SELECT * FROM categories WHERE name IN ('Test Clothing','Test Service','Clothing A','Service A');
-- DELETE FROM categories WHERE name IN ('Test Clothing','Test Service','Clothing A','Service A');

-- Clothing items created by tests
SELECT * FROM clothing_items WHERE name IN ('OnlyA','ItemA');
-- First, remove dependent item_service_prices
-- DELETE FROM item_service_prices WHERE clothing_item_id IN (SELECT id FROM clothing_items WHERE name IN ('OnlyA','ItemA'));
-- Then delete items
-- DELETE FROM clothing_items WHERE name IN ('OnlyA','ItemA');

-- Laundry services created by tests
SELECT * FROM laundry_services WHERE name IN ('ServiceA','Wash','Dry');
-- DELETE FROM item_service_prices WHERE service_id IN (SELECT id FROM laundry_services WHERE name IN ('ServiceA','Wash','Dry'));
-- DELETE FROM laundry_services WHERE name IN ('ServiceA','Wash','Dry');

-- Item-service price mappings created by tests
SELECT * FROM item_service_prices isp
JOIN clothing_items ci ON ci.id = isp.clothing_item_id
JOIN laundry_services ls ON ls.id = isp.service_id
JOIN branches b ON b.id = isp.branch_id
WHERE ci.name IN ('OnlyA','ItemA') OR ls.name IN ('ServiceA','Wash','Dry') OR b.name IN ('Branch A','Branch B');

