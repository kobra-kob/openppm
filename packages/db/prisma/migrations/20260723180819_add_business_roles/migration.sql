-- AlterTable
ALTER TABLE `approval_steps` MODIFY `approver_role` ENUM('admin', 'manager', 'project_manager', 'pmo', 'finance', 'employee', 'observer', 'guest', 'business_analyst', 'executive') NOT NULL;

-- AlterTable
ALTER TABLE `roles` MODIFY `key` ENUM('admin', 'manager', 'project_manager', 'pmo', 'finance', 'employee', 'observer', 'guest', 'business_analyst', 'executive') NULL;
