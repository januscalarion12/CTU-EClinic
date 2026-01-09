-- Migration script to fix the role check constraint in the users table
-- This script drops the existing constraint and adds a new one that includes 'admin'

DECLARE @ConstraintName nvarchar(200);
SELECT @ConstraintName = Name 
FROM sys.check_constraints 
WHERE parent_object_id = OBJECT_ID('users') 
AND definition LIKE '%role%IN%nurse%student%';

IF @ConstraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE users DROP CONSTRAINT ' + @ConstraintName);
    PRINT 'Dropped existing constraint: ' + @ConstraintName;
END

ALTER TABLE users ADD CONSTRAINT CK_users_role CHECK (role IN ('nurse', 'student', 'admin'));
PRINT 'Added new constraint CK_users_role with admin role support.';
