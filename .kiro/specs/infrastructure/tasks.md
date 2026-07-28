# Implementation Plan

> **Retired (2026-07-27).** This spec describes the dedicated-subdomain hosting
> approach that was abandoned in dbf68d6. The app is now served as a subpath of
> the shared sumiya.page site via the root `deploy.sh`, and the `infrastructure/`
> directory this spec produced has been deleted along with its CloudFormation
> stacks. The checked boxes below reflect work that was completed and has since
> been removed; nothing here is actionable.

- [x] 1. Set up infrastructure directory structure
  - Create `infrastructure/` directory in project root
  - Create subdirectories for templates and scripts
  - _Requirements: 2.1, 6.1_

- [x] 2. Create CloudFormation template
  - [x] 2.1 Define template parameters
    - Add DomainName parameter (String)
    - Add Subdomain parameter (String)
    - Add BucketName parameter (String)
    - Add Environment parameter (String with AllowedValues: production, dev)
    - _Requirements: 2.1, 3.3, 3.4, 10.4_

  - [x] 2.2 Define S3 bucket resource
    - Create S3 bucket with static website hosting enabled
    - Configure index document as index.html
    - Configure error document as index.html
    - Enable versioning
    - Block all public access
    - _Requirements: 1.3, 2.2, 5.1, 5.3_

  - [x] 2.3 Define CloudFront Origin Access Identity
    - Create OAI resource for CloudFront to access S3
    - _Requirements: 5.2_

  - [x] 2.4 Define S3 bucket policy
    - Create bucket policy allowing only CloudFront OAI access
    - Deny all other access
    - _Requirements: 5.1, 5.2_

  - [x] 2.5 Define ACM certificate resource
    - Create ACM certificate for subdomain in us-east-1 region
    - Configure DNS validation via Route 53
    - _Requirements: 2.5, 4.2, 4.3, 4.4_

  - [x] 2.6 Define Route 53 hosted zone
    - Create hosted zone for DNS management
    - _Requirements: 2.4_

  - [x] 2.7 Define Route 53 A record
    - Create A record alias pointing to CloudFront distribution
    - Use subdomain from parameters
    - _Requirements: 3.1, 3.2_

  - [x] 2.8 Define CloudFront distribution
    - Configure S3 bucket as origin with OAI
    - Set default root object to index.html
    - Configure custom error responses (403 and 404 to index.html with 200 status)
    - Enable HTTP to HTTPS redirect
    - Attach ACM certificate
    - Set compression to enabled
    - Set default TTL to 86400 seconds
    - Set price class to PriceClass_All
    - Allow GET, HEAD, OPTIONS methods
    - Configure alternate domain names (CNAME) with subdomain
    - _Requirements: 1.3, 1.4, 1.5, 2.3, 4.1, 4.2, 11.1, 11.2, 11.3, 11.4_

  - [x] 2.9 Define stack outputs
    - Output S3BucketName
    - Output CloudFrontDistributionId
    - Output CloudFrontDomainName
    - Output Route53NameServers
    - Output ACMCertificateArn
    - Output WebsiteURL (https://subdomain.domain.com)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 2.10 Write property test for parameter propagation
    - **Property 10: Parameter propagation**
    - **Validates: Requirements 3.3, 3.4, 10.4**

- [x] 3. Create environment configuration files
  - [x] 3.1 Create .env.example template
    - Add DOMAIN_NAME variable
    - Add SUBDOMAIN variable
    - Add S3_BUCKET_NAME variable
    - Add ENVIRONMENT variable
    - Add AWS_REGION variable (default: us-east-1)
    - Add AWS_PROFILE variable (default: default)
    - Add STACK_NAME variable
    - Include comments explaining each variable
    - _Requirements: 10.2, 10.4_

  - [x] 3.2 Update .gitignore for infrastructure
    - Ensure .env is listed in .gitignore
    - Add infrastructure/.env if not already covered
    - _Requirements: 10.3_

- [x] 4. Create deployment script
  - [x] 4.1 Implement load_env function
    - Read .env file from infrastructure directory
    - Parse and export environment variables
    - Validate all required variables are present
    - Display error for missing variables
    - _Requirements: 6.1, 10.1_

  - [x] 4.2 Write property test for environment variable loading
    - **Property 2: Environment variable loading**
    - **Validates: Requirements 6.1, 10.1**

  - [x] 4.3 Implement validate_template function
    - Use AWS CLI to validate CloudFormation template syntax
    - Display validation success or error messages
    - Exit script if validation fails
    - _Requirements: 6.2_

  - [x] 4.4 Write property test for CloudFormation template validation
    - **Property 1: CloudFormation template validation**
    - **Validates: Requirements 6.2**

  - [x] 4.5 Implement deploy_stack function
    - Check if stack exists (create vs update)
    - Build AWS CLI command with parameters from environment
    - Execute CloudFormation create-stack or update-stack
    - Handle stack already exists scenarios
    - Display deployment initiation message
    - _Requirements: 6.3_

  - [x] 4.6 Implement wait_for_stack function
    - Poll CloudFormation stack status
    - Display progress updates
    - Wait for CREATE_COMPLETE or UPDATE_COMPLETE status
    - Handle failure statuses (ROLLBACK_COMPLETE, etc.)
    - Exit with error if stack deployment fails
    - _Requirements: 6.3_

  - [x] 4.7 Implement display_cert_validation function
    - Retrieve ACM certificate ARN from stack outputs
    - Fetch certificate validation records
    - Display DNS validation instructions
    - Show CNAME name and value to add to DNS
    - _Requirements: 9.5_

  - [x] 4.8 Implement wait_for_cert_validation function
    - Poll ACM certificate status
    - Wait for ISSUED status
    - Display progress updates
    - Timeout after reasonable period (e.g., 30 minutes)
    - Provide option to continue waiting or exit
    - _Requirements: 9.5_

  - [x] 4.9 Implement sync_files function
    - Build AWS S3 sync command
    - Exclude tests/ directory
    - Exclude sample-data/ directory
    - Exclude .git/ directory
    - Exclude .kiro/ directory
    - Exclude infrastructure/ directory
    - Exclude node_modules/ directory
    - Exclude .env file
    - Exclude .gitignore file
    - Exclude project README.md
    - Include index.html, css/, js/, lib/, assets/
    - Execute sync command to S3 bucket
    - Display sync progress and results
    - _Requirements: 1.1, 1.2, 6.4_

  - [x] 4.10 Write property test for file exclusion during sync
    - **Property 4: File exclusion during sync**
    - **Validates: Requirements 1.2**

  - [x] 4.11 Implement invalidate_cache function
    - Retrieve CloudFront distribution ID from stack outputs
    - Create cache invalidation for all paths (/*) 
    - Display invalidation ID and status
    - _Requirements: 6.5_

  - [x] 4.12 Write property test for CloudFront cache invalidation
    - **Property 5: CloudFront cache invalidation**
    - **Validates: Requirements 6.5**

  - [x] 4.13 Implement display_summary function
    - Display all stack outputs (bucket name, distribution ID, nameservers, etc.)
    - Display website URL
    - Provide next steps instructions (nameserver configuration)
    - Display estimated DNS propagation time
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 9.6_

  - [x] 4.14 Implement main script flow
    - Call load_env
    - Call validate_template
    - Call deploy_stack
    - Call wait_for_stack
    - Call display_cert_validation
    - Call wait_for_cert_validation
    - Call sync_files
    - Call invalidate_cache
    - Call display_summary
    - Add error handling for each step
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 5. Create infrastructure README
  - [x] 5.1 Document prerequisites
    - AWS CLI installed and configured
    - AWS account with appropriate permissions
    - Domain name registered (or access to domain registrar)
    - Bash shell environment
    - _Requirements: 9.1, 9.2_

  - [x] 5.2 Document environment setup
    - Copy .env.example to .env
    - Fill in required values
    - Explain each environment variable
    - _Requirements: 9.2, 9.3_

  - [x] 5.3 Document deployment steps
    - Navigate to infrastructure directory
    - Configure .env file
    - Run deployment script
    - Wait for stack creation
    - Complete ACM certificate validation
    - Update domain nameservers
    - Wait for DNS propagation
    - Verify deployment
    - _Requirements: 9.4_

  - [x] 5.4 Document ACM certificate validation
    - Explain DNS validation process
    - Provide step-by-step instructions
    - Include troubleshooting for validation issues
    - _Requirements: 9.5_

  - [x] 5.5 Document nameserver configuration
    - Explain Route 53 nameserver delegation
    - Provide instructions for common domain registrars
    - Include DNS propagation checking commands
    - _Requirements: 9.6_

  - [x] 5.6 Document multi-environment setup
    - Explain dev vs production configuration
    - Provide example .env files for each environment
    - Document environment-specific subdomain naming
    - _Requirements: 7.1, 7.2, 7.3, 9.2_

  - [x] 5.7 Document troubleshooting procedures
    - Common deployment errors and solutions
    - CloudFormation stack failure debugging
    - ACM certificate validation issues
    - DNS propagation problems
    - S3 sync errors
    - CloudFront cache issues
    - _Requirements: 9.7_

  - [x] 5.8 Document rollback procedures
    - File-level rollback using S3 versioning
    - Stack-level rollback commands
    - Complete disaster recovery steps
    - _Requirements: 9.7_

- [x] 6. Create multi-environment support
  - [x] 6.1 Create .env.production example
    - Configure production subdomain
    - Configure production bucket name
    - Set environment to production
    - _Requirements: 7.1, 7.3_

  - [x] 6.2 Create .env.dev example
    - Configure dev subdomain (e.g., trading-dev)
    - Configure dev bucket name
    - Set environment to dev
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 7. Checkpoint - Validate infrastructure deployment
  - Ensure all tests pass, ask the user if questions arise
  - Manually verify CloudFormation template validates successfully
  - Manually verify deployment script functions work correctly
  - Test deployment to a test AWS account (if available)

- [x] 7.5 Simplify deployment process
  - [x] 7.5.1 Create environment-specific deployment scripts
    - Create deploy-dev.sh for development deployments
    - Create deploy-prod.sh for production deployments
    - Add production safety confirmation prompt
    - _Requirements: 6.1, 9.4_

  - [x] 7.5.2 Refactor common deployment logic
    - Rename deploy.sh to deploy-common.sh
    - Remove environment file selection logic
    - Simplify environment variable validation
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 7.5.3 Update documentation
    - Update README with one-shot deployment instructions
    - Document deploy-dev.sh and deploy-prod.sh usage
    - Remove complex environment file management steps
    - _Requirements: 9.2, 9.4_

- [x] 8. Create integration tests
  - [x] 8.1 Create essential infrastructure tests
    - Test CloudFormation template validation
    - Test environment variable loading
    - Test file exclusion during sync
    - Test CloudFront cache invalidation
    - Test parameter propagation
    - _Note: Removed verbose/redundant tests that just grep templates_

- [x] 9. Final checkpoint - Complete deployment verification
  - All essential tests pass
  - Documentation is complete and concise
  - All requirements are addressed through deployment scripts and tests
