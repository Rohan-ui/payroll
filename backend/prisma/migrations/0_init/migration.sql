-- rndtechnosoft Payroll + HRMS
-- PostgreSQL 15+ | UTC TIMESTAMPTZ(6) | UUID
-- Baseline Migration 0_init

CREATE TABLE rndtechnosoft_users (
    id UUID NOT NULL,
    email VARCHAR(320) NOT NULL,
    password_hash VARCHAR(255) NULL,
    display_name VARCHAR(160) NULL,
    mobile_number VARCHAR(32) NULL,
    user_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    email_verified_at TIMESTAMPTZ(6) NULL,
    last_login_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_users_1 UNIQUE (email),
    CHECK (user_status IN ('INVITED','ACTIVE','SUSPENDED','DISABLED'))
);

CREATE TABLE rndtechnosoft_tenants (
    id UUID NOT NULL,
    tenant_code VARCHAR(64) NOT NULL,
    legal_name VARCHAR(200) NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    country_code CHAR(2) NULL,
    default_currency_code CHAR(3) NOT NULL DEFAULT 'INR',
    tenant_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    archived_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_tenants_1 UNIQUE (tenant_code)
);

CREATE TABLE rndtechnosoft_tenant_settings (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    settings JSONB NOT NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_tenant_settings_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_tenant_settings_1 UNIQUE (tenant_id),
    CONSTRAINT fk_tenant_settings_1 FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id) ON DELETE CASCADE
);

CREATE TABLE rndtechnosoft_tenant_members (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    membership_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    invited_at TIMESTAMPTZ(6) NULL,
    joined_at TIMESTAMPTZ(6) NULL,
    archived_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_tenant_members_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_tenant_members_1 UNIQUE (tenant_id,user_id),
    CONSTRAINT fk_tenant_members_1 FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id),
    CONSTRAINT fk_tenant_members_2 FOREIGN KEY (user_id) REFERENCES rndtechnosoft_users (id)
);
CREATE INDEX ix_tenant_members_1 ON rndtechnosoft_tenant_members (tenant_id,membership_status);

CREATE TABLE rndtechnosoft_permissions (
    id UUID NOT NULL,
    permission_code VARCHAR(120) NOT NULL,
    module_code VARCHAR(64) NOT NULL,
    permission_name VARCHAR(160) NOT NULL,
    description VARCHAR(500) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_permissions_1 UNIQUE (permission_code)
);

CREATE TABLE rndtechnosoft_roles (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    role_code VARCHAR(64) NOT NULL,
    role_name VARCHAR(120) NOT NULL,
    description VARCHAR(500) NULL,
    is_system_role BOOLEAN NOT NULL DEFAULT FALSE,
    role_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    archived_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_roles_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_roles_1 UNIQUE (tenant_id,role_code),
    CONSTRAINT fk_roles_1 FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id)
);
CREATE INDEX ix_roles_1 ON rndtechnosoft_roles (tenant_id,role_status);

CREATE TABLE rndtechnosoft_role_permissions (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    role_id UUID NOT NULL,
    permission_id UUID NOT NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_role_permissions_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_role_permissions_1 UNIQUE (tenant_id,role_id,permission_id),
    CONSTRAINT fk_role_permissions_1 FOREIGN KEY (tenant_id,role_id) REFERENCES rndtechnosoft_roles (tenant_id,id),
    CONSTRAINT fk_role_permissions_2 FOREIGN KEY (permission_id) REFERENCES rndtechnosoft_permissions (id)
);

CREATE TABLE rndtechnosoft_tenant_member_roles (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    tenant_member_id UUID NOT NULL,
    role_id UUID NOT NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_tenant_member_roles_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_tenant_member_roles_1 UNIQUE (tenant_id,tenant_member_id,role_id),
    CONSTRAINT fk_tenant_member_roles_1 FOREIGN KEY (tenant_id,tenant_member_id) REFERENCES rndtechnosoft_tenant_members (tenant_id,id),
    CONSTRAINT fk_tenant_member_roles_2 FOREIGN KEY (tenant_id,role_id) REFERENCES rndtechnosoft_roles (tenant_id,id)
);

CREATE TABLE rndtechnosoft_modules (
    id UUID NOT NULL,
    module_code VARCHAR(64) NOT NULL,
    module_name VARCHAR(120) NOT NULL,
    module_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_modules_1 UNIQUE (module_code)
);

CREATE TABLE rndtechnosoft_plans (
    id UUID NOT NULL,
    plan_code VARCHAR(64) NOT NULL,
    plan_name VARCHAR(120) NOT NULL,
    billing_interval VARCHAR(32) NULL,
    plan_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_plans_1 UNIQUE (plan_code)
);

CREATE TABLE rndtechnosoft_plan_modules (
    id UUID NOT NULL,
    plan_id UUID NOT NULL,
    module_id UUID NOT NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_plan_modules_1 UNIQUE (plan_id,module_id),
    CONSTRAINT fk_plan_modules_1 FOREIGN KEY (plan_id) REFERENCES rndtechnosoft_plans (id),
    CONSTRAINT fk_plan_modules_2 FOREIGN KEY (module_id) REFERENCES rndtechnosoft_modules (id)
);

CREATE TABLE rndtechnosoft_tenant_subscriptions (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    plan_id UUID NOT NULL,
    subscription_status VARCHAR(32) NOT NULL,
    starts_on DATE NOT NULL,
    ends_on DATE NULL,
    trial_ends_on DATE NULL,
    external_subscription_reference VARCHAR(160) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_tenant_subscriptions_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_tenant_subscriptions_1 FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id),
    CONSTRAINT fk_tenant_subscriptions_2 FOREIGN KEY (plan_id) REFERENCES rndtechnosoft_plans (id),
    CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX ix_tenant_subscriptions_1 ON rndtechnosoft_tenant_subscriptions (tenant_id,subscription_status);

CREATE TABLE rndtechnosoft_branches (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    branch_code VARCHAR(64) NOT NULL,
    branch_name VARCHAR(160) NOT NULL,
    country_code CHAR(2) NULL,
    state_code VARCHAR(64) NULL,
    city VARCHAR(120) NULL,
    address_line_1 VARCHAR(200) NULL,
    address_line_2 VARCHAR(200) NULL,
    postal_code VARCHAR(24) NULL,
    timezone VARCHAR(64) NULL,
    branch_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    archived_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_branches_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_branches_1 UNIQUE (tenant_id,branch_code),
    CONSTRAINT fk_branches_1 FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id)
);
CREATE INDEX ix_branches_1 ON rndtechnosoft_branches (tenant_id,branch_status);

CREATE TABLE rndtechnosoft_departments (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    parent_department_id UUID NULL,
    department_code VARCHAR(64) NOT NULL,
    department_name VARCHAR(160) NOT NULL,
    department_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    archived_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_departments_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_departments_1 UNIQUE (tenant_id,department_code),
    CONSTRAINT fk_departments_1 FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id),
    CONSTRAINT fk_departments_2 FOREIGN KEY (tenant_id,parent_department_id) REFERENCES rndtechnosoft_departments (tenant_id,id),
    CHECK (parent_department_id IS NULL OR parent_department_id <> id)
);
CREATE INDEX ix_departments_1 ON rndtechnosoft_departments (tenant_id,parent_department_id);

CREATE TABLE rndtechnosoft_designations (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    designation_code VARCHAR(64) NOT NULL,
    designation_name VARCHAR(160) NOT NULL,
    designation_level VARCHAR(64) NULL,
    designation_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    archived_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_designations_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_designations_1 UNIQUE (tenant_id,designation_code),
    CONSTRAINT fk_designations_1 FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id)
);

CREATE TABLE rndtechnosoft_teams (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    department_id UUID NULL,
    team_code VARCHAR(64) NOT NULL,
    team_name VARCHAR(160) NOT NULL,
    team_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    archived_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_teams_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_teams_1 UNIQUE (tenant_id,team_code),
    CONSTRAINT fk_teams_1 FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id),
    CONSTRAINT fk_teams_2 FOREIGN KEY (tenant_id,department_id) REFERENCES rndtechnosoft_departments (tenant_id,id)
);

CREATE TABLE rndtechnosoft_cost_centers (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    parent_cost_center_id UUID NULL,
    cost_center_code VARCHAR(64) NOT NULL,
    cost_center_name VARCHAR(160) NOT NULL,
    cost_center_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    archived_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_cost_centers_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_cost_centers_1 UNIQUE (tenant_id,cost_center_code),
    CONSTRAINT fk_cost_centers_1 FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id),
    CONSTRAINT fk_cost_centers_2 FOREIGN KEY (tenant_id,parent_cost_center_id) REFERENCES rndtechnosoft_cost_centers (tenant_id,id),
    CHECK (parent_cost_center_id IS NULL OR parent_cost_center_id <> id)
);

CREATE TABLE rndtechnosoft_employment_types (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employment_type_code VARCHAR(64) NOT NULL,
    employment_type_name VARCHAR(120) NOT NULL,
    employment_type_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_employment_types_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_employment_types_1 UNIQUE (tenant_id,employment_type_code),
    CONSTRAINT fk_employment_types_1 FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id)
);

CREATE TABLE rndtechnosoft_employees (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    user_id UUID NULL,
    employee_code VARCHAR(64) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100) NULL,
    last_name VARCHAR(100) NULL,
    preferred_name VARCHAR(100) NULL,
    date_of_birth DATE NULL,
    gender_code VARCHAR(32) NULL,
    work_email VARCHAR(320) NULL,
    personal_email VARCHAR(320) NULL,
    work_mobile VARCHAR(32) NULL,
    employee_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    hire_date DATE NULL,
    exit_date DATE NULL,
    archived_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_employees_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_employees_1 UNIQUE (tenant_id,employee_code),
    CONSTRAINT uq_employees_2 UNIQUE (tenant_id,user_id),
    CONSTRAINT fk_employees_1 FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id),
    CONSTRAINT fk_employees_2 FOREIGN KEY (user_id) REFERENCES rndtechnosoft_users (id),
    CHECK (exit_date IS NULL OR hire_date IS NULL OR exit_date >= hire_date)
);
CREATE INDEX ix_employees_1 ON rndtechnosoft_employees (tenant_id,employee_status);
CREATE INDEX ix_employees_2 ON rndtechnosoft_employees (tenant_id,last_name,first_name);

CREATE TABLE rndtechnosoft_employee_employments (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    employment_type_id UUID NULL,
    branch_id UUID NULL,
    department_id UUID NULL,
    designation_id UUID NULL,
    team_id UUID NULL,
    cost_center_id UUID NULL,
    joining_date DATE NOT NULL,
    confirmation_date DATE NULL,
    termination_date DATE NULL,
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    employment_status VARCHAR(32) NOT NULL,
    probation_end_date DATE NULL,
    notice_period_days INT NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_employee_employments_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_employee_employments_1 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id),
    CONSTRAINT fk_employee_employments_2 FOREIGN KEY (tenant_id,employment_type_id) REFERENCES rndtechnosoft_employment_types (tenant_id,id),
    CONSTRAINT fk_employee_employments_3 FOREIGN KEY (tenant_id,branch_id) REFERENCES rndtechnosoft_branches (tenant_id,id),
    CONSTRAINT fk_employee_employments_4 FOREIGN KEY (tenant_id,department_id) REFERENCES rndtechnosoft_departments (tenant_id,id),
    CONSTRAINT fk_employee_employments_5 FOREIGN KEY (tenant_id,designation_id) REFERENCES rndtechnosoft_designations (tenant_id,id),
    CONSTRAINT fk_employee_employments_6 FOREIGN KEY (tenant_id,team_id) REFERENCES rndtechnosoft_teams (tenant_id,id),
    CONSTRAINT fk_employee_employments_7 FOREIGN KEY (tenant_id,cost_center_id) REFERENCES rndtechnosoft_cost_centers (tenant_id,id),
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CHECK (termination_date IS NULL OR termination_date >= joining_date)
);
CREATE INDEX ix_employee_employments_1 ON rndtechnosoft_employee_employments (tenant_id,employee_id,effective_from);

CREATE TABLE rndtechnosoft_employee_reporting_lines (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    manager_employee_id UUID NOT NULL,
    relationship_type VARCHAR(32) NOT NULL DEFAULT 'PRIMARY',
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_employee_reporting_lines_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_employee_reporting_lines_1 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id),
    CONSTRAINT fk_employee_reporting_lines_2 FOREIGN KEY (tenant_id,manager_employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id),
    CHECK (employee_id <> manager_employee_id),
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ix_employee_reporting_lines_1 ON rndtechnosoft_employee_reporting_lines (tenant_id,employee_id,effective_from);
CREATE INDEX ix_employee_reporting_lines_2 ON rndtechnosoft_employee_reporting_lines (tenant_id,manager_employee_id);

CREATE TABLE rndtechnosoft_employee_addresses (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    address_type VARCHAR(32) NOT NULL,
    address_line_1 VARCHAR(200) NOT NULL,
    address_line_2 VARCHAR(200) NULL,
    city VARCHAR(120) NOT NULL,
    state_region VARCHAR(120) NULL,
    postal_code VARCHAR(24) NULL,
    country_code CHAR(2) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    valid_from DATE NULL,
    valid_to DATE NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_employee_addresses_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_employee_addresses_1 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id)
);
CREATE INDEX ix_employee_addresses_1 ON rndtechnosoft_employee_addresses (tenant_id,employee_id);

CREATE TABLE rndtechnosoft_employee_emergency_contacts (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    contact_name VARCHAR(160) NOT NULL,
    relationship VARCHAR(64) NULL,
    mobile_number VARCHAR(32) NOT NULL,
    alternate_mobile_number VARCHAR(32) NULL,
    email VARCHAR(320) NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_employee_emergency_contacts_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_employee_emergency_contacts_1 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id)
);
CREATE INDEX ix_employee_emergency_contacts_1 ON rndtechnosoft_employee_emergency_contacts (tenant_id,employee_id);

CREATE TABLE rndtechnosoft_employee_bank_accounts (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    account_holder_name VARCHAR(160) NOT NULL,
    bank_name VARCHAR(160) NOT NULL,
    branch_name VARCHAR(160) NULL,
    account_number_encrypted VARCHAR(512) NOT NULL,
    account_number_last4 CHAR(4) NULL,
    bank_code_type VARCHAR(32) NULL,
    bank_code VARCHAR(64) NULL,
    account_type VARCHAR(32) NULL,
    payment_priority INT NOT NULL DEFAULT 1,
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    bank_account_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_employee_bank_accounts_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_employee_bank_accounts_1 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id),
    CHECK (payment_priority > 0),
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ix_employee_bank_accounts_1 ON rndtechnosoft_employee_bank_accounts (tenant_id,employee_id,effective_from);

CREATE TABLE rndtechnosoft_employee_documents (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    document_type VARCHAR(64) NOT NULL,
    document_number VARCHAR(160) NULL,
    document_name VARCHAR(200) NOT NULL,
    storage_key VARCHAR(500) NOT NULL,
    issued_on DATE NULL,
    expires_on DATE NULL,
    verified_at TIMESTAMPTZ(6) NULL,
    verified_by_tenant_member_id UUID NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_employee_documents_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_employee_documents_1 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id),
    CONSTRAINT fk_employee_documents_2 FOREIGN KEY (tenant_id,verified_by_tenant_member_id) REFERENCES rndtechnosoft_tenant_members (tenant_id,id)
);
CREATE INDEX ix_employee_documents_1 ON rndtechnosoft_employee_documents (tenant_id,employee_id);

CREATE TABLE rndtechnosoft_employee_identifiers (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    identifier_type VARCHAR(64) NOT NULL,
    identifier_value_encrypted VARCHAR(512) NOT NULL,
    identifier_last4 VARCHAR(8) NULL,
    country_code CHAR(2) NULL,
    issued_on DATE NULL,
    expires_on DATE NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_employee_identifiers_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_employee_identifiers_1 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id)
);
CREATE INDEX ix_employee_identifiers_1 ON rndtechnosoft_employee_identifiers (tenant_id,employee_id,identifier_type);

CREATE TABLE rndtechnosoft_employee_dependents (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    dependent_name VARCHAR(160) NOT NULL,
    relationship VARCHAR(64) NOT NULL,
    date_of_birth DATE NULL,
    is_nominee BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_employee_dependents_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_employee_dependents_1 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id)
);
CREATE INDEX ix_employee_dependents_1 ON rndtechnosoft_employee_dependents (tenant_id,employee_id);

CREATE TABLE rndtechnosoft_employee_education (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    institution_name VARCHAR(200) NOT NULL,
    qualification_name VARCHAR(160) NOT NULL,
    field_of_study VARCHAR(160) NULL,
    start_date DATE NULL,
    end_date DATE NULL,
    grade_or_score VARCHAR(64) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_employee_education_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_employee_education_1 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id)
);
CREATE INDEX ix_employee_education_1 ON rndtechnosoft_employee_education (tenant_id,employee_id);

CREATE TABLE rndtechnosoft_employee_experience (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    employer_name VARCHAR(200) NOT NULL,
    job_title VARCHAR(160) NOT NULL,
    start_date DATE NULL,
    end_date DATE NULL,
    responsibilities TEXT NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_employee_experience_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_employee_experience_1 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id)
);
CREATE INDEX ix_employee_experience_1 ON rndtechnosoft_employee_experience (tenant_id,employee_id);

CREATE TABLE rndtechnosoft_shifts (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    shift_code VARCHAR(64) NOT NULL,
    shift_name VARCHAR(120) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    crosses_midnight BOOLEAN NOT NULL DEFAULT FALSE,
    grace_in_minutes INT NOT NULL DEFAULT 0,
    grace_out_minutes INT NOT NULL DEFAULT 0,
    standard_work_minutes INT NOT NULL,
    shift_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    archived_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_shifts_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_shifts_1 UNIQUE (tenant_id,shift_code),
    CONSTRAINT fk_shifts_1 FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id)
);

CREATE TABLE rndtechnosoft_shift_breaks (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    shift_id UUID NOT NULL,
    break_name VARCHAR(120) NOT NULL,
    break_start_time TIME NULL,
    break_end_time TIME NULL,
    break_duration_minutes INT NOT NULL,
    is_paid_break BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_shift_breaks_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_shift_breaks_1 FOREIGN KEY (tenant_id,shift_id) REFERENCES rndtechnosoft_shifts (tenant_id,id)
);
CREATE INDEX ix_shift_breaks_1 ON rndtechnosoft_shift_breaks (tenant_id,shift_id);

CREATE TABLE rndtechnosoft_employee_shift_assignments (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    shift_id UUID NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    assignment_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_employee_shift_assignments_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_employee_shift_assignments_1 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id),
    CONSTRAINT fk_employee_shift_assignments_2 FOREIGN KEY (tenant_id,shift_id) REFERENCES rndtechnosoft_shifts (tenant_id,id)
);
CREATE INDEX ix_employee_shift_assignments_1 ON rndtechnosoft_employee_shift_assignments (tenant_id,employee_id,effective_from);

CREATE TABLE rndtechnosoft_attendance_records (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    attendance_date DATE NOT NULL,
    shift_id UUID NULL,
    attendance_status VARCHAR(32) NOT NULL,
    first_check_in_at TIMESTAMPTZ(6) NULL,
    last_check_out_at TIMESTAMPTZ(6) NULL,
    worked_minutes INT NOT NULL DEFAULT 0,
    payable_minutes INT NOT NULL DEFAULT 0,
    late_minutes INT NOT NULL DEFAULT 0,
    early_departure_minutes INT NOT NULL DEFAULT 0,
    overtime_minutes INT NOT NULL DEFAULT 0,
    source VARCHAR(32) NOT NULL DEFAULT 'SYSTEM',
    approval_status VARCHAR(32) NOT NULL DEFAULT 'NOT_REQUIRED',
    finalized_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_attendance_records_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_attendance_records_1 UNIQUE (tenant_id,employee_id,attendance_date),
    CONSTRAINT fk_attendance_records_1 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id),
    CONSTRAINT fk_attendance_records_2 FOREIGN KEY (tenant_id,shift_id) REFERENCES rndtechnosoft_shifts (tenant_id,id)
);
CREATE INDEX ix_attendance_records_1 ON rndtechnosoft_attendance_records (tenant_id,attendance_date);

CREATE TABLE rndtechnosoft_attendance_punches (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    attendance_record_id UUID NULL,
    punch_at TIMESTAMPTZ(6) NOT NULL,
    punch_type VARCHAR(16) NOT NULL,
    source VARCHAR(32) NOT NULL,
    device_reference VARCHAR(160) NULL,
    latitude NUMERIC(10,7) NULL,
    longitude NUMERIC(10,7) NULL,
    raw_reference VARCHAR(200) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_attendance_punches_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_attendance_punches_1 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id),
    CONSTRAINT fk_attendance_punches_2 FOREIGN KEY (tenant_id,attendance_record_id) REFERENCES rndtechnosoft_attendance_records (tenant_id,id)
);
CREATE INDEX ix_attendance_punches_1 ON rndtechnosoft_attendance_punches (tenant_id,employee_id,punch_at);

CREATE TABLE rndtechnosoft_attendance_adjustments (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    attendance_record_id UUID NOT NULL,
    requested_by_tenant_member_id UUID NOT NULL,
    approved_by_tenant_member_id UUID NULL,
    adjustment_reason VARCHAR(500) NOT NULL,
    requested_values JSONB NOT NULL,
    adjustment_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    approved_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_attendance_adjustments_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_attendance_adjustments_1 FOREIGN KEY (tenant_id,attendance_record_id) REFERENCES rndtechnosoft_attendance_records (tenant_id,id),
    CONSTRAINT fk_attendance_adjustments_2 FOREIGN KEY (tenant_id,requested_by_tenant_member_id) REFERENCES rndtechnosoft_tenant_members (tenant_id,id),
    CONSTRAINT fk_attendance_adjustments_3 FOREIGN KEY (tenant_id,approved_by_tenant_member_id) REFERENCES rndtechnosoft_tenant_members (tenant_id,id)
);
CREATE INDEX ix_attendance_adjustments_1 ON rndtechnosoft_attendance_adjustments (tenant_id,attendance_record_id);

CREATE TABLE rndtechnosoft_holiday_calendars (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    calendar_code VARCHAR(64) NOT NULL,
    calendar_name VARCHAR(160) NOT NULL,
    country_code CHAR(2) NULL,
    state_region VARCHAR(120) NULL,
    calendar_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    archived_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_holiday_calendars_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_holiday_calendars_1 UNIQUE (tenant_id,calendar_code),
    CONSTRAINT fk_holiday_calendars_1 FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id)
);

CREATE TABLE rndtechnosoft_holidays (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    holiday_calendar_id UUID NOT NULL,
    holiday_date DATE NOT NULL,
    holiday_name VARCHAR(160) NOT NULL,
    is_optional BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_holidays_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_holidays_1 UNIQUE (tenant_id,holiday_calendar_id,holiday_date,holiday_name),
    CONSTRAINT fk_holidays_1 FOREIGN KEY (tenant_id,holiday_calendar_id) REFERENCES rndtechnosoft_holiday_calendars (tenant_id,id)
);
CREATE INDEX ix_holidays_1 ON rndtechnosoft_holidays (tenant_id,holiday_date);

CREATE TABLE rndtechnosoft_holiday_calendar_assignments (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    holiday_calendar_id UUID NOT NULL,
    employee_id UUID NULL,
    branch_id UUID NULL,
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_holiday_calendar_assignments_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_holiday_calendar_assignments_1 FOREIGN KEY (tenant_id,holiday_calendar_id) REFERENCES rndtechnosoft_holiday_calendars (tenant_id,id),
    CONSTRAINT fk_holiday_calendar_assignments_2 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id),
    CONSTRAINT fk_holiday_calendar_assignments_3 FOREIGN KEY (tenant_id,branch_id) REFERENCES rndtechnosoft_branches (tenant_id,id),
    CHECK (employee_id IS NOT NULL OR branch_id IS NOT NULL)
);
CREATE INDEX ix_holiday_calendar_assignments_1 ON rndtechnosoft_holiday_calendar_assignments (tenant_id,employee_id,effective_from);
CREATE INDEX ix_holiday_calendar_assignments_2 ON rndtechnosoft_holiday_calendar_assignments (tenant_id,branch_id,effective_from);

CREATE TABLE rndtechnosoft_leave_types (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    leave_type_code VARCHAR(64) NOT NULL,
    leave_type_name VARCHAR(120) NOT NULL,
    is_paid BOOLEAN NOT NULL DEFAULT TRUE,
    allows_half_day BOOLEAN NOT NULL DEFAULT TRUE,
    requires_attachment BOOLEAN NOT NULL DEFAULT FALSE,
    leave_type_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    archived_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_leave_types_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_leave_types_1 UNIQUE (tenant_id,leave_type_code),
    CONSTRAINT fk_leave_types_1 FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id)
);

CREATE TABLE rndtechnosoft_leave_policies (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    leave_policy_code VARCHAR(64) NOT NULL,
    leave_policy_name VARCHAR(160) NOT NULL,
    policy_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    archived_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_leave_policies_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_leave_policies_1 UNIQUE (tenant_id,leave_policy_code),
    CONSTRAINT fk_leave_policies_1 FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id)
);

CREATE TABLE rndtechnosoft_leave_policy_rules (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    leave_policy_id UUID NOT NULL,
    leave_type_id UUID NOT NULL,
    annual_entitlement_days NUMERIC(8,2) NOT NULL DEFAULT 0,
    accrual_frequency VARCHAR(32) NULL,
    accrual_days NUMERIC(8,2) NULL,
    max_carry_forward_days NUMERIC(8,2) NULL,
    max_balance_days NUMERIC(8,2) NULL,
    min_notice_days INT NOT NULL DEFAULT 0,
    max_consecutive_days NUMERIC(8,2) NULL,
    probation_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    encashment_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_leave_policy_rules_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_leave_policy_rules_1 UNIQUE (tenant_id,leave_policy_id,leave_type_id),
    CONSTRAINT fk_leave_policy_rules_1 FOREIGN KEY (tenant_id,leave_policy_id) REFERENCES rndtechnosoft_leave_policies (tenant_id,id),
    CONSTRAINT fk_leave_policy_rules_2 FOREIGN KEY (tenant_id,leave_type_id) REFERENCES rndtechnosoft_leave_types (tenant_id,id)
);

CREATE TABLE rndtechnosoft_employee_leave_policy_assignments (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    leave_policy_id UUID NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    assignment_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_employee_leave_policy_assignments_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_employee_leave_policy_assignments_1 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id),
    CONSTRAINT fk_employee_leave_policy_assignments_2 FOREIGN KEY (tenant_id,leave_policy_id) REFERENCES rndtechnosoft_leave_policies (tenant_id,id)
);
CREATE INDEX ix_employee_leave_policy_assignments_1 ON rndtechnosoft_employee_leave_policy_assignments (tenant_id,employee_id,effective_from);

CREATE TABLE rndtechnosoft_leave_requests (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    leave_type_id UUID NOT NULL,
    request_number VARCHAR(64) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    requested_days NUMERIC(8,2) NOT NULL,
    reason VARCHAR(1000) NULL,
    request_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    submitted_at TIMESTAMPTZ(6) NULL,
    final_decision_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_leave_requests_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_leave_requests_1 UNIQUE (tenant_id,request_number),
    CONSTRAINT fk_leave_requests_1 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id),
    CONSTRAINT fk_leave_requests_2 FOREIGN KEY (tenant_id,leave_type_id) REFERENCES rndtechnosoft_leave_types (tenant_id,id)
);
CREATE INDEX ix_leave_requests_1 ON rndtechnosoft_leave_requests (tenant_id,employee_id,start_date,end_date);
CREATE INDEX ix_leave_requests_2 ON rndtechnosoft_leave_requests (tenant_id,request_status);

CREATE TABLE rndtechnosoft_leave_request_days (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    leave_request_id UUID NOT NULL,
    leave_date DATE NOT NULL,
    day_fraction NUMERIC(4,2) NOT NULL DEFAULT 1.00,
    day_portion VARCHAR(16) NOT NULL DEFAULT 'FULL',
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_leave_request_days_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_leave_request_days_1 UNIQUE (tenant_id,leave_request_id,leave_date),
    CONSTRAINT fk_leave_request_days_1 FOREIGN KEY (tenant_id,leave_request_id) REFERENCES rndtechnosoft_leave_requests (tenant_id,id)
);

CREATE TABLE rndtechnosoft_leave_approvals (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    leave_request_id UUID NOT NULL,
    approver_tenant_member_id UUID NOT NULL,
    approval_sequence INT NOT NULL,
    approval_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    comments VARCHAR(1000) NULL,
    decided_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_leave_approvals_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_leave_approvals_1 UNIQUE (tenant_id,leave_request_id,approval_sequence),
    CONSTRAINT fk_leave_approvals_1 FOREIGN KEY (tenant_id,leave_request_id) REFERENCES rndtechnosoft_leave_requests (tenant_id,id),
    CONSTRAINT fk_leave_approvals_2 FOREIGN KEY (tenant_id,approver_tenant_member_id) REFERENCES rndtechnosoft_tenant_members (tenant_id,id)
);

CREATE TABLE rndtechnosoft_leave_balance_transactions (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    leave_type_id UUID NOT NULL,
    transaction_date DATE NOT NULL,
    transaction_type VARCHAR(32) NOT NULL,
    quantity_days NUMERIC(8,2) NOT NULL,
    reference_type VARCHAR(64) NULL,
    reference_id UUID NULL,
    description VARCHAR(500) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_leave_balance_transactions_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_leave_balance_transactions_1 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id),
    CONSTRAINT fk_leave_balance_transactions_2 FOREIGN KEY (tenant_id,leave_type_id) REFERENCES rndtechnosoft_leave_types (tenant_id,id),
    CHECK (quantity_days <> 0)
);
CREATE INDEX ix_leave_balance_transactions_1 ON rndtechnosoft_leave_balance_transactions (tenant_id,employee_id,leave_type_id,transaction_date);

CREATE TABLE rndtechnosoft_leave_balance_summaries (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    leave_type_id UUID NOT NULL,
    balance_days NUMERIC(8,2) NOT NULL DEFAULT 0,
    as_of_date DATE NOT NULL,
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_leave_balance_summaries_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_leave_balance_summaries_1 UNIQUE (tenant_id,employee_id,leave_type_id),
    CONSTRAINT fk_leave_balance_summaries_1 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id),
    CONSTRAINT fk_leave_balance_summaries_2 FOREIGN KEY (tenant_id,leave_type_id) REFERENCES rndtechnosoft_leave_types (tenant_id,id)
);

CREATE TABLE rndtechnosoft_salary_components (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    component_code VARCHAR(64) NOT NULL,
    component_name VARCHAR(160) NOT NULL,
    component_category VARCHAR(16) NOT NULL,
    calculation_type VARCHAR(32) NOT NULL,
    is_taxable BOOLEAN NOT NULL DEFAULT TRUE,
    is_recurring BOOLEAN NOT NULL DEFAULT TRUE,
    is_variable BOOLEAN NOT NULL DEFAULT FALSE,
    show_on_payslip BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INT NOT NULL DEFAULT 100,
    rounding_scale INT NOT NULL DEFAULT 2,
    formula_key VARCHAR(120) NULL,
    component_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    archived_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_salary_components_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_salary_components_1 UNIQUE (tenant_id,component_code),
    CONSTRAINT fk_salary_components_1 FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id)
);

CREATE TABLE rndtechnosoft_salary_structures (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    salary_structure_code VARCHAR(64) NOT NULL,
    salary_structure_name VARCHAR(160) NOT NULL,
    pay_frequency VARCHAR(32) NOT NULL DEFAULT 'MONTHLY',
    structure_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    archived_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_salary_structures_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_salary_structures_1 UNIQUE (tenant_id,salary_structure_code),
    CONSTRAINT fk_salary_structures_1 FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id)
);

CREATE TABLE rndtechnosoft_salary_structure_components (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    salary_structure_id UUID NOT NULL,
    salary_component_id UUID NOT NULL,
    default_amount NUMERIC(18,2) NULL,
    default_percentage NUMERIC(9,4) NULL,
    percentage_base_component_id UUID NULL,
    formula_config JSONB NULL,
    is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INT NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_salary_structure_components_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_salary_structure_components_1 UNIQUE (tenant_id,salary_structure_id,salary_component_id),
    CONSTRAINT fk_salary_structure_components_1 FOREIGN KEY (tenant_id,salary_structure_id) REFERENCES rndtechnosoft_salary_structures (tenant_id,id),
    CONSTRAINT fk_salary_structure_components_2 FOREIGN KEY (tenant_id,salary_component_id) REFERENCES rndtechnosoft_salary_components (tenant_id,id),
    CONSTRAINT fk_salary_structure_components_3 FOREIGN KEY (tenant_id,percentage_base_component_id) REFERENCES rndtechnosoft_salary_components (tenant_id,id)
);

CREATE TABLE rndtechnosoft_employee_salary_assignments (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    salary_structure_id UUID NOT NULL,
    annual_ctc NUMERIC(18,2) NULL,
    monthly_gross_target NUMERIC(18,2) NULL,
    currency_code CHAR(3) NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    assignment_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    change_reason VARCHAR(500) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_employee_salary_assignments_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_employee_salary_assignments_1 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id),
    CONSTRAINT fk_employee_salary_assignments_2 FOREIGN KEY (tenant_id,salary_structure_id) REFERENCES rndtechnosoft_salary_structures (tenant_id,id)
);
CREATE INDEX ix_employee_salary_assignments_1 ON rndtechnosoft_employee_salary_assignments (tenant_id,employee_id,effective_from);

CREATE TABLE rndtechnosoft_employee_salary_component_values (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_salary_assignment_id UUID NOT NULL,
    salary_component_id UUID NOT NULL,
    amount NUMERIC(18,2) NULL,
    percentage NUMERIC(9,4) NULL,
    calculation_override_type VARCHAR(32) NULL,
    formula_config JSONB NULL,
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_employee_salary_component_values_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_employee_salary_component_values_1 FOREIGN KEY (tenant_id,employee_salary_assignment_id) REFERENCES rndtechnosoft_employee_salary_assignments (tenant_id,id),
    CONSTRAINT fk_employee_salary_component_values_2 FOREIGN KEY (tenant_id,salary_component_id) REFERENCES rndtechnosoft_salary_components (tenant_id,id)
);
CREATE INDEX ix_employee_salary_component_values_1 ON rndtechnosoft_employee_salary_component_values (tenant_id,employee_salary_assignment_id,salary_component_id);

CREATE TABLE rndtechnosoft_statutory_schemes (
    id UUID NOT NULL,
    country_code CHAR(2) NOT NULL,
    scheme_code VARCHAR(64) NOT NULL,
    scheme_name VARCHAR(160) NOT NULL,
    scheme_type VARCHAR(64) NOT NULL,
    scheme_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_statutory_schemes_1 UNIQUE (country_code,scheme_code)
);

CREATE TABLE rndtechnosoft_tenant_statutory_registrations (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    statutory_scheme_id UUID NOT NULL,
    branch_id UUID NULL,
    registration_number VARCHAR(160) NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    registration_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    metadata JSONB NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_tenant_statutory_registrations_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_tenant_statutory_registrations_1 FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id),
    CONSTRAINT fk_tenant_statutory_registrations_2 FOREIGN KEY (statutory_scheme_id) REFERENCES rndtechnosoft_statutory_schemes (id),
    CONSTRAINT fk_tenant_statutory_registrations_3 FOREIGN KEY (tenant_id,branch_id) REFERENCES rndtechnosoft_branches (tenant_id,id)
);
CREATE INDEX ix_tenant_statutory_registrations_1 ON rndtechnosoft_tenant_statutory_registrations (tenant_id,statutory_scheme_id);

CREATE TABLE rndtechnosoft_employee_statutory_enrollments (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    statutory_scheme_id UUID NOT NULL,
    enrollment_number_encrypted VARCHAR(512) NULL,
    enrollment_number_last4 VARCHAR(8) NULL,
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    enrollment_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    metadata JSONB NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_employee_statutory_enrollments_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_employee_statutory_enrollments_1 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id),
    CONSTRAINT fk_employee_statutory_enrollments_2 FOREIGN KEY (statutory_scheme_id) REFERENCES rndtechnosoft_statutory_schemes (id)
);
CREATE INDEX ix_employee_statutory_enrollments_1 ON rndtechnosoft_employee_statutory_enrollments (tenant_id,employee_id,statutory_scheme_id);

CREATE TABLE rndtechnosoft_payroll_periods (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    period_code VARCHAR(64) NOT NULL,
    pay_frequency VARCHAR(32) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    payment_date DATE NULL,
    period_status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_payroll_periods_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_payroll_periods_1 UNIQUE (tenant_id,period_code),
    CONSTRAINT fk_payroll_periods_1 FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id),
    CHECK (period_end >= period_start)
);
CREATE INDEX ix_payroll_periods_1 ON rndtechnosoft_payroll_periods (tenant_id,period_start,period_end);

CREATE TABLE rndtechnosoft_payroll_runs (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    payroll_period_id UUID NOT NULL,
    run_number VARCHAR(64) NOT NULL,
    run_type VARCHAR(32) NOT NULL DEFAULT 'REGULAR',
    run_status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    calculation_started_at TIMESTAMPTZ(6) NULL,
    calculation_completed_at TIMESTAMPTZ(6) NULL,
    reviewed_at TIMESTAMPTZ(6) NULL,
    approved_at TIMESTAMPTZ(6) NULL,
    finalized_at TIMESTAMPTZ(6) NULL,
    paid_at TIMESTAMPTZ(6) NULL,
    created_by_tenant_member_id UUID NULL,
    approved_by_tenant_member_id UUID NULL,
    finalized_by_tenant_member_id UUID NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_payroll_runs_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_payroll_runs_1 UNIQUE (tenant_id,run_number),
    CONSTRAINT fk_payroll_runs_1 FOREIGN KEY (tenant_id,payroll_period_id) REFERENCES rndtechnosoft_payroll_periods (tenant_id,id),
    CONSTRAINT fk_payroll_runs_2 FOREIGN KEY (tenant_id,created_by_tenant_member_id) REFERENCES rndtechnosoft_tenant_members (tenant_id,id),
    CONSTRAINT fk_payroll_runs_3 FOREIGN KEY (tenant_id,approved_by_tenant_member_id) REFERENCES rndtechnosoft_tenant_members (tenant_id,id),
    CONSTRAINT fk_payroll_runs_4 FOREIGN KEY (tenant_id,finalized_by_tenant_member_id) REFERENCES rndtechnosoft_tenant_members (tenant_id,id)
);
CREATE INDEX ix_payroll_runs_1 ON rndtechnosoft_payroll_runs (tenant_id,payroll_period_id);
CREATE INDEX ix_payroll_runs_2 ON rndtechnosoft_payroll_runs (tenant_id,run_status);

CREATE TABLE rndtechnosoft_payroll_run_employees (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    payroll_run_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    salary_assignment_id UUID NULL,
    processing_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    payable_days NUMERIC(8,2) NULL,
    loss_of_pay_days NUMERIC(8,2) NULL,
    gross_earnings NUMERIC(18,2) NOT NULL DEFAULT 0,
    gross_deductions NUMERIC(18,2) NOT NULL DEFAULT 0,
    net_pay NUMERIC(18,2) NOT NULL DEFAULT 0,
    calculation_error TEXT NULL,
    calculation_snapshot JSONB NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_payroll_run_employees_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_payroll_run_employees_1 UNIQUE (tenant_id,payroll_run_id,employee_id),
    CONSTRAINT fk_payroll_run_employees_1 FOREIGN KEY (tenant_id,payroll_run_id) REFERENCES rndtechnosoft_payroll_runs (tenant_id,id),
    CONSTRAINT fk_payroll_run_employees_2 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id),
    CONSTRAINT fk_payroll_run_employees_3 FOREIGN KEY (tenant_id,salary_assignment_id) REFERENCES rndtechnosoft_employee_salary_assignments (tenant_id,id)
);
CREATE INDEX ix_payroll_run_employees_1 ON rndtechnosoft_payroll_run_employees (tenant_id,employee_id);

CREATE TABLE rndtechnosoft_payroll_inputs (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    payroll_period_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    salary_component_id UUID NOT NULL,
    amount NUMERIC(18,2) NOT NULL,
    input_source VARCHAR(32) NOT NULL,
    input_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    reference_type VARCHAR(64) NULL,
    reference_id UUID NULL,
    notes VARCHAR(1000) NULL,
    approved_by_tenant_member_id UUID NULL,
    approved_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_payroll_inputs_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_payroll_inputs_1 FOREIGN KEY (tenant_id,payroll_period_id) REFERENCES rndtechnosoft_payroll_periods (tenant_id,id),
    CONSTRAINT fk_payroll_inputs_2 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id),
    CONSTRAINT fk_payroll_inputs_3 FOREIGN KEY (tenant_id,salary_component_id) REFERENCES rndtechnosoft_salary_components (tenant_id,id),
    CONSTRAINT fk_payroll_inputs_4 FOREIGN KEY (tenant_id,approved_by_tenant_member_id) REFERENCES rndtechnosoft_tenant_members (tenant_id,id)
);
CREATE INDEX ix_payroll_inputs_1 ON rndtechnosoft_payroll_inputs (tenant_id,payroll_period_id,employee_id);
CREATE INDEX ix_payroll_inputs_2 ON rndtechnosoft_payroll_inputs (tenant_id,salary_component_id);

CREATE TABLE rndtechnosoft_payslips (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    payroll_run_employee_id UUID NOT NULL,
    payroll_run_id UUID NOT NULL,
    payroll_period_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    payslip_number VARCHAR(64) NOT NULL,
    employee_code_snapshot VARCHAR(64) NOT NULL,
    employee_name_snapshot VARCHAR(240) NOT NULL,
    branch_name_snapshot VARCHAR(160) NULL,
    department_name_snapshot VARCHAR(160) NULL,
    designation_name_snapshot VARCHAR(160) NULL,
    bank_account_last4_snapshot CHAR(4) NULL,
    currency_code CHAR(3) NOT NULL,
    gross_earnings NUMERIC(18,2) NOT NULL,
    gross_deductions NUMERIC(18,2) NOT NULL,
    net_pay NUMERIC(18,2) NOT NULL,
    payslip_status VARCHAR(32) NOT NULL DEFAULT 'GENERATED',
    generated_at TIMESTAMPTZ(6) NOT NULL,
    finalized_at TIMESTAMPTZ(6) NULL,
    snapshot_metadata JSONB NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_payslips_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_payslips_1 UNIQUE (tenant_id,payslip_number),
    CONSTRAINT uq_payslips_2 UNIQUE (tenant_id,payroll_run_employee_id),
    CONSTRAINT fk_payslips_1 FOREIGN KEY (tenant_id,payroll_run_employee_id) REFERENCES rndtechnosoft_payroll_run_employees (tenant_id,id),
    CONSTRAINT fk_payslips_2 FOREIGN KEY (tenant_id,payroll_run_id) REFERENCES rndtechnosoft_payroll_runs (tenant_id,id),
    CONSTRAINT fk_payslips_3 FOREIGN KEY (tenant_id,payroll_period_id) REFERENCES rndtechnosoft_payroll_periods (tenant_id,id),
    CONSTRAINT fk_payslips_4 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id)
);
CREATE INDEX ix_payslips_1 ON rndtechnosoft_payslips (tenant_id,employee_id,payroll_period_id);

CREATE TABLE rndtechnosoft_payslip_lines (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    payslip_id UUID NOT NULL,
    salary_component_id UUID NULL,
    component_code_snapshot VARCHAR(64) NOT NULL,
    component_name_snapshot VARCHAR(160) NOT NULL,
    component_category VARCHAR(16) NOT NULL,
    calculation_type_snapshot VARCHAR(32) NULL,
    quantity NUMERIC(18,4) NULL,
    rate NUMERIC(18,4) NULL,
    amount NUMERIC(18,2) NOT NULL,
    taxable_amount NUMERIC(18,2) NULL,
    display_order INT NOT NULL DEFAULT 100,
    source VARCHAR(32) NULL,
    calculation_metadata JSONB NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_payslip_lines_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_payslip_lines_1 FOREIGN KEY (tenant_id,payslip_id) REFERENCES rndtechnosoft_payslips (tenant_id,id),
    CONSTRAINT fk_payslip_lines_2 FOREIGN KEY (tenant_id,salary_component_id) REFERENCES rndtechnosoft_salary_components (tenant_id,id)
);
CREATE INDEX ix_payslip_lines_1 ON rndtechnosoft_payslip_lines (tenant_id,payslip_id,display_order);

CREATE TABLE rndtechnosoft_statutory_deductions (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    payslip_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    statutory_scheme_id UUID NOT NULL,
    employee_contribution NUMERIC(18,2) NOT NULL DEFAULT 0,
    employer_contribution NUMERIC(18,2) NOT NULL DEFAULT 0,
    taxable_base_amount NUMERIC(18,2) NULL,
    calculation_metadata JSONB NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_statutory_deductions_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_statutory_deductions_1 FOREIGN KEY (tenant_id,payslip_id) REFERENCES rndtechnosoft_payslips (tenant_id,id),
    CONSTRAINT fk_statutory_deductions_2 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id),
    CONSTRAINT fk_statutory_deductions_3 FOREIGN KEY (statutory_scheme_id) REFERENCES rndtechnosoft_statutory_schemes (id)
);
CREATE INDEX ix_statutory_deductions_1 ON rndtechnosoft_statutory_deductions (tenant_id,payslip_id);

CREATE TABLE rndtechnosoft_reimbursement_types (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    reimbursement_type_code VARCHAR(64) NOT NULL,
    reimbursement_type_name VARCHAR(160) NOT NULL,
    taxable BOOLEAN NOT NULL DEFAULT FALSE,
    requires_receipt BOOLEAN NOT NULL DEFAULT TRUE,
    reimbursement_type_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_reimbursement_types_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_reimbursement_types_1 UNIQUE (tenant_id,reimbursement_type_code),
    CONSTRAINT fk_reimbursement_types_1 FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id)
);

CREATE TABLE rndtechnosoft_reimbursement_claims (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    claim_number VARCHAR(64) NOT NULL,
    claim_date DATE NOT NULL,
    total_claimed_amount NUMERIC(18,2) NOT NULL,
    total_approved_amount NUMERIC(18,2) NULL,
    currency_code CHAR(3) NOT NULL,
    claim_status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    submitted_at TIMESTAMPTZ(6) NULL,
    approved_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_reimbursement_claims_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_reimbursement_claims_1 UNIQUE (tenant_id,claim_number),
    CONSTRAINT fk_reimbursement_claims_1 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id)
);
CREATE INDEX ix_reimbursement_claims_1 ON rndtechnosoft_reimbursement_claims (tenant_id,employee_id,claim_date);

CREATE TABLE rndtechnosoft_reimbursement_claim_items (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    reimbursement_claim_id UUID NOT NULL,
    reimbursement_type_id UUID NOT NULL,
    expense_date DATE NOT NULL,
    description VARCHAR(1000) NOT NULL,
    claimed_amount NUMERIC(18,2) NOT NULL,
    approved_amount NUMERIC(18,2) NULL,
    receipt_storage_key VARCHAR(500) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_reimbursement_claim_items_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_reimbursement_claim_items_1 FOREIGN KEY (tenant_id,reimbursement_claim_id) REFERENCES rndtechnosoft_reimbursement_claims (tenant_id,id),
    CONSTRAINT fk_reimbursement_claim_items_2 FOREIGN KEY (tenant_id,reimbursement_type_id) REFERENCES rndtechnosoft_reimbursement_types (tenant_id,id)
);
CREATE INDEX ix_reimbursement_claim_items_1 ON rndtechnosoft_reimbursement_claim_items (tenant_id,reimbursement_claim_id);

CREATE TABLE rndtechnosoft_reimbursement_approvals (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    reimbursement_claim_id UUID NOT NULL,
    approver_tenant_member_id UUID NOT NULL,
    approval_sequence INT NOT NULL,
    approval_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    comments VARCHAR(1000) NULL,
    decided_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_reimbursement_approvals_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_reimbursement_approvals_1 UNIQUE (tenant_id,reimbursement_claim_id,approval_sequence),
    CONSTRAINT fk_reimbursement_approvals_1 FOREIGN KEY (tenant_id,reimbursement_claim_id) REFERENCES rndtechnosoft_reimbursement_claims (tenant_id,id),
    CONSTRAINT fk_reimbursement_approvals_2 FOREIGN KEY (tenant_id,approver_tenant_member_id) REFERENCES rndtechnosoft_tenant_members (tenant_id,id)
);

CREATE TABLE rndtechnosoft_employee_loans (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    loan_number VARCHAR(64) NOT NULL,
    loan_type VARCHAR(32) NOT NULL,
    principal_amount NUMERIC(18,2) NOT NULL,
    interest_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_repayable_amount NUMERIC(18,2) NOT NULL,
    installment_amount NUMERIC(18,2) NOT NULL,
    start_date DATE NOT NULL,
    expected_end_date DATE NULL,
    loan_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    closed_at TIMESTAMPTZ(6) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_employee_loans_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_employee_loans_1 UNIQUE (tenant_id,loan_number),
    CONSTRAINT fk_employee_loans_1 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id)
);
CREATE INDEX ix_employee_loans_1 ON rndtechnosoft_employee_loans (tenant_id,employee_id,loan_status);

CREATE TABLE rndtechnosoft_loan_installments (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_loan_id UUID NOT NULL,
    installment_number INT NOT NULL,
    due_date DATE NOT NULL,
    principal_amount NUMERIC(18,2) NOT NULL,
    interest_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(18,2) NOT NULL,
    installment_status VARCHAR(32) NOT NULL DEFAULT 'SCHEDULED',
    payroll_period_id UUID NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_loan_installments_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_loan_installments_1 UNIQUE (tenant_id,employee_loan_id,installment_number),
    CONSTRAINT fk_loan_installments_1 FOREIGN KEY (tenant_id,employee_loan_id) REFERENCES rndtechnosoft_employee_loans (tenant_id,id),
    CONSTRAINT fk_loan_installments_2 FOREIGN KEY (tenant_id,payroll_period_id) REFERENCES rndtechnosoft_payroll_periods (tenant_id,id)
);

CREATE TABLE rndtechnosoft_loan_repayments (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    employee_loan_id UUID NOT NULL,
    loan_installment_id UUID NULL,
    repayment_date DATE NOT NULL,
    amount NUMERIC(18,2) NOT NULL,
    repayment_source VARCHAR(32) NOT NULL,
    payroll_run_employee_id UUID NULL,
    payment_reference VARCHAR(160) NULL,
    notes VARCHAR(500) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_loan_repayments_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_loan_repayments_1 FOREIGN KEY (tenant_id,employee_loan_id) REFERENCES rndtechnosoft_employee_loans (tenant_id,id),
    CONSTRAINT fk_loan_repayments_2 FOREIGN KEY (tenant_id,loan_installment_id) REFERENCES rndtechnosoft_loan_installments (tenant_id,id),
    CONSTRAINT fk_loan_repayments_3 FOREIGN KEY (tenant_id,payroll_run_employee_id) REFERENCES rndtechnosoft_payroll_run_employees (tenant_id,id)
);
CREATE INDEX ix_loan_repayments_1 ON rndtechnosoft_loan_repayments (tenant_id,employee_loan_id,repayment_date);

CREATE TABLE rndtechnosoft_payroll_payment_batches (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    payroll_run_id UUID NOT NULL,
    batch_number VARCHAR(64) NOT NULL,
    payment_method VARCHAR(32) NOT NULL,
    payment_date DATE NULL,
    batch_status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    total_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
    bank_file_storage_key VARCHAR(500) NULL,
    external_reference VARCHAR(160) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_payroll_payment_batches_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT uq_payroll_payment_batches_1 UNIQUE (tenant_id,batch_number),
    CONSTRAINT fk_payroll_payment_batches_1 FOREIGN KEY (tenant_id,payroll_run_id) REFERENCES rndtechnosoft_payroll_runs (tenant_id,id)
);

CREATE TABLE rndtechnosoft_payroll_payments (
    id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    payroll_payment_batch_id UUID NULL,
    payslip_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    employee_bank_account_id UUID NULL,
    payment_method VARCHAR(32) NOT NULL,
    payment_amount NUMERIC(18,2) NOT NULL,
    payment_date DATE NULL,
    payment_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    payment_reference VARCHAR(160) NULL,
    failure_reason VARCHAR(500) NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_payroll_payments_tenant_id UNIQUE (tenant_id,id),
    CONSTRAINT fk_payroll_payments_1 FOREIGN KEY (tenant_id,payroll_payment_batch_id) REFERENCES rndtechnosoft_payroll_payment_batches (tenant_id,id),
    CONSTRAINT fk_payroll_payments_2 FOREIGN KEY (tenant_id,payslip_id) REFERENCES rndtechnosoft_payslips (tenant_id,id),
    CONSTRAINT fk_payroll_payments_3 FOREIGN KEY (tenant_id,employee_id) REFERENCES rndtechnosoft_employees (tenant_id,id),
    CONSTRAINT fk_payroll_payments_4 FOREIGN KEY (tenant_id,employee_bank_account_id) REFERENCES rndtechnosoft_employee_bank_accounts (tenant_id,id)
);
CREATE INDEX ix_payroll_payments_1 ON rndtechnosoft_payroll_payments (tenant_id,payslip_id);
CREATE INDEX ix_payroll_payments_2 ON rndtechnosoft_payroll_payments (tenant_id,employee_id);

CREATE TABLE rndtechnosoft_audit_logs (
    id UUID NOT NULL,
    tenant_id UUID NULL,
    actor_user_id UUID NULL,
    actor_tenant_member_id UUID NULL,
    action_code VARCHAR(120) NOT NULL,
    entity_type VARCHAR(120) NOT NULL,
    entity_id UUID NULL,
    occurred_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    old_values JSONB NULL,
    new_values JSONB NULL,
    metadata JSONB NULL,
    ip_address VARCHAR(64) NULL,
    user_agent VARCHAR(500) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_audit_logs_1 FOREIGN KEY (tenant_id) REFERENCES rndtechnosoft_tenants (id),
    CONSTRAINT fk_audit_logs_2 FOREIGN KEY (actor_user_id) REFERENCES rndtechnosoft_users (id),
    CONSTRAINT fk_audit_logs_3 FOREIGN KEY (tenant_id,actor_tenant_member_id) REFERENCES rndtechnosoft_tenant_members (tenant_id,id)
);
CREATE INDEX ix_audit_logs_1 ON rndtechnosoft_audit_logs (tenant_id,occurred_at);
CREATE INDEX ix_audit_logs_2 ON rndtechnosoft_audit_logs (tenant_id,entity_type,entity_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION rndtechnosoft_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP(6);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rndtechnosoft_users_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_users
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_tenants_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_tenants
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_tenant_settings_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_tenant_settings
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_tenant_members_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_tenant_members
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_roles_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_roles
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_plans_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_plans
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_tenant_subscriptions_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_tenant_subscriptions
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_branches_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_branches
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_departments_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_departments
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_designations_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_designations
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_teams_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_teams
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_cost_centers_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_cost_centers
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_employment_types_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_employment_types
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_employees_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_employees
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_employee_employments_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_employee_employments
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_employee_reporting_lines_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_employee_reporting_lines
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_employee_addresses_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_employee_addresses
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_employee_emergency_contacts_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_employee_emergency_contacts
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_employee_bank_accounts_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_employee_bank_accounts
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_employee_documents_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_employee_documents
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_employee_identifiers_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_employee_identifiers
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_employee_dependents_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_employee_dependents
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_employee_education_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_employee_education
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_employee_experience_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_employee_experience
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_shifts_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_shifts
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_employee_shift_assignments_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_employee_shift_assignments
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_attendance_records_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_attendance_records
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_attendance_adjustments_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_attendance_adjustments
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_holiday_calendars_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_holiday_calendars
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_leave_types_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_leave_types
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_leave_policies_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_leave_policies
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_leave_policy_rules_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_leave_policy_rules
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_employee_leave_policy_assignments_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_employee_leave_policy_assignments
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_leave_requests_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_leave_requests
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_leave_approvals_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_leave_approvals
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_leave_balance_summaries_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_leave_balance_summaries
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_salary_components_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_salary_components
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_salary_structures_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_salary_structures
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_salary_structure_components_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_salary_structure_components
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_employee_salary_assignments_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_employee_salary_assignments
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_employee_salary_component_values_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_employee_salary_component_values
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_tenant_statutory_registrations_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_tenant_statutory_registrations
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_employee_statutory_enrollments_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_employee_statutory_enrollments
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_payroll_periods_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_payroll_periods
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_payroll_runs_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_payroll_runs
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_payroll_run_employees_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_payroll_run_employees
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_payroll_inputs_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_payroll_inputs
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_reimbursement_types_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_reimbursement_types
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_reimbursement_claims_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_reimbursement_claims
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_reimbursement_claim_items_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_reimbursement_claim_items
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_employee_loans_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_employee_loans
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_loan_installments_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_loan_installments
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_payroll_payment_batches_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_payroll_payment_batches
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();

CREATE TRIGGER trg_rndtechnosoft_payroll_payments_touch_updated_at
BEFORE UPDATE ON rndtechnosoft_payroll_payments
FOR EACH ROW
EXECUTE FUNCTION rndtechnosoft_set_updated_at();
