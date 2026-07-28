# Requirements Document

> **Retired (2026-07-27).** This spec describes the dedicated-subdomain hosting
> approach that was abandoned in dbf68d6. The app is now served as a subpath of
> the shared sumiya.page site via the root `deploy.sh`, and the `infrastructure/`
> directory this spec produced has been deleted along with its CloudFormation
> stacks. Kept for historical context only.

## Introduction

This document specifies the requirements for deploying the option trading insights as a static website using AWS infrastructure. The deployment system shall provide a secure, scalable, and automated solution for hosting static web content with custom subdomain routing, HTTPS support, and global content delivery.

## Glossary

- **Static Website**: A website consisting of HTML, CSS, JavaScript, and asset files that are served directly without server-side processing
- **S3 Bucket**: Amazon Simple Storage Service bucket used for object storage
- **CloudFront Distribution**: Amazon CloudFront content delivery network (CDN) distribution for global content delivery
- **Route 53 Hosted Zone**: Amazon Route 53 DNS hosted zone for domain name management
- **ACM Certificate**: AWS Certificate Manager SSL/TLS certificate for HTTPS
- **OAI**: Origin Access Identity - CloudFront identity used to access private S3 buckets
- **CloudFormation Stack**: AWS CloudFormation infrastructure as code deployment unit
- **Deployment System**: The complete infrastructure and automation scripts for deploying the static website
- **Environment**: A deployment target (production or dev) with separate infrastructure resources

## Requirements

### Requirement 1

**User Story:** As a developer, I want to deploy static website files to AWS infrastructure, so that the trading journal application is accessible via the internet.

#### Acceptance Criteria

1. WHEN the deployment system is invoked THEN the Deployment System SHALL upload all HTML, CSS, JavaScript, and asset files to the S3 Bucket
2. WHEN uploading files THEN the Deployment System SHALL exclude test files, sample data, git files, and configuration files from deployment
3. WHEN files are uploaded to the S3 Bucket THEN the S3 Bucket SHALL serve the files to the CloudFront Distribution
4. WHEN the CloudFront Distribution receives a request for the root path THEN the CloudFront Distribution SHALL serve the index.html file
5. WHEN the CloudFront Distribution receives a 403 or 404 error THEN the CloudFront Distribution SHALL serve the index.html file with a 200 status code

### Requirement 2

**User Story:** As a developer, I want to use infrastructure as code for AWS resources, so that deployments are repeatable and version-controlled.

#### Acceptance Criteria

1. WHEN infrastructure is deployed THEN the Deployment System SHALL use CloudFormation templates to create all AWS resources
2. WHEN the CloudFormation template is deployed THEN the CloudFormation Stack SHALL create an S3 Bucket with static website hosting enabled
3. WHEN the CloudFormation template is deployed THEN the CloudFormation Stack SHALL create a CloudFront Distribution configured with the S3 Bucket as origin
4. WHEN the CloudFormation template is deployed THEN the CloudFormation Stack SHALL create a Route 53 Hosted Zone for DNS management
5. WHEN the CloudFormation template is deployed THEN the CloudFormation Stack SHALL create an ACM Certificate for HTTPS in the us-east-1 region

### Requirement 3

**User Story:** As a developer, I want to use custom subdomain routing, so that the application is accessible via a branded URL.

#### Acceptance Criteria

1. WHEN the CloudFormation Stack is deployed THEN the Route 53 Hosted Zone SHALL create an A record alias pointing to the CloudFront Distribution
2. WHEN a user accesses the subdomain URL THEN the Route 53 Hosted Zone SHALL route traffic to the CloudFront Distribution
3. WHEN the subdomain is configured THEN the CloudFormation Stack SHALL accept the subdomain as a parameter
4. WHEN the domain name is configured THEN the CloudFormation Stack SHALL accept the root domain name as a parameter

### Requirement 4

**User Story:** As a developer, I want HTTPS support for the custom domain, so that user connections are secure and encrypted.

#### Acceptance Criteria

1. WHEN the CloudFront Distribution receives an HTTP request THEN the CloudFront Distribution SHALL redirect the request to HTTPS
2. WHEN the CloudFront Distribution serves content THEN the CloudFront Distribution SHALL use the ACM Certificate for SSL/TLS encryption
3. WHEN the ACM Certificate is created THEN the ACM Certificate SHALL be configured for the specific subdomain
4. WHEN the ACM Certificate is created THEN the ACM Certificate SHALL use DNS validation via Route 53

### Requirement 5

**User Story:** As a developer, I want S3 bucket security controls, so that website files are protected from unauthorized access.

#### Acceptance Criteria

1. WHEN the S3 Bucket is created THEN the S3 Bucket SHALL block all public access
2. WHEN the S3 Bucket is accessed THEN the S3 Bucket SHALL allow access only from the CloudFront Distribution via OAI
3. WHEN the S3 Bucket is configured THEN the S3 Bucket SHALL enable versioning for rollback capability
4. WHEN the S3 Bucket stores files THEN the S3 Bucket SHALL not contain any sensitive configuration values

### Requirement 6

**User Story:** As a developer, I want automated deployment scripts, so that I can deploy updates quickly and consistently.

#### Acceptance Criteria

1. WHEN the deployment script is executed THEN the Deployment System SHALL load environment variables from a configuration file
2. WHEN the deployment script validates the template THEN the Deployment System SHALL verify the CloudFormation template syntax
3. WHEN the deployment script deploys infrastructure THEN the Deployment System SHALL create or update the CloudFormation Stack with parameters
4. WHEN the deployment script uploads files THEN the Deployment System SHALL sync website files to the S3 Bucket
5. WHEN the deployment script completes file upload THEN the Deployment System SHALL invalidate the CloudFront Distribution cache

### Requirement 7

**User Story:** As a developer, I want support for multiple environments, so that I can maintain separate dev and production deployments.

#### Acceptance Criteria

1. WHEN deploying to different environments THEN the Deployment System SHALL support separate dev and production configurations
2. WHEN deploying to different environments THEN the Deployment System SHALL create separate S3 Buckets for each environment
3. WHEN deploying to different environments THEN the Deployment System SHALL use environment-specific subdomain names

### Requirement 8

**User Story:** As a developer, I want CloudFormation stack outputs, so that I can access deployment information and complete manual configuration steps.

#### Acceptance Criteria

1. WHEN the CloudFormation Stack is created THEN the CloudFormation Stack SHALL output the S3 Bucket name
2. WHEN the CloudFormation Stack is created THEN the CloudFormation Stack SHALL output the CloudFront Distribution ID and domain name
3. WHEN the CloudFormation Stack is created THEN the CloudFormation Stack SHALL output the Route 53 nameservers
4. WHEN the CloudFormation Stack is created THEN the CloudFormation Stack SHALL output the ACM Certificate ARN
5. WHEN the CloudFormation Stack is created THEN the CloudFormation Stack SHALL output the website URL

### Requirement 9

**User Story:** As a developer, I want comprehensive deployment documentation, so that I can understand prerequisites, configuration, and troubleshooting steps.

#### Acceptance Criteria

1. WHEN documentation is provided THEN the Deployment System SHALL include a README file in the infrastructure directory
2. WHEN the README is consulted THEN the README SHALL document all prerequisites and setup instructions
3. WHEN the README is consulted THEN the README SHALL document environment variable configuration
4. WHEN the README is consulted THEN the README SHALL document the step-by-step deployment process
5. WHEN the README is consulted THEN the README SHALL document ACM certificate validation instructions
6. WHEN the README is consulted THEN the README SHALL document domain nameserver update instructions
7. WHEN the README is consulted THEN the README SHALL document troubleshooting procedures

### Requirement 10

**User Story:** As a developer, I want environment variable configuration, so that sensitive values are not committed to version control.

#### Acceptance Criteria

1. WHEN configuration is needed THEN the Deployment System SHALL use a .env file for environment-specific values
2. WHEN the .env file is created THEN the Deployment System SHALL provide a .env.example template file
3. WHEN the .env file exists THEN the Deployment System SHALL ensure the .env file is listed in .gitignore
4. WHEN parameters are used THEN the Deployment System SHALL accept domain name, subdomain, AWS region, and environment as parameters

### Requirement 11

**User Story:** As a developer, I want CloudFront caching and compression, so that the website loads quickly for users worldwide.

#### Acceptance Criteria

1. WHEN the CloudFront Distribution serves content THEN the CloudFront Distribution SHALL compress objects automatically
2. WHEN the CloudFront Distribution caches content THEN the CloudFront Distribution SHALL use a default TTL of 86400 seconds
3. WHEN the CloudFront Distribution is configured THEN the CloudFront Distribution SHALL use PriceClass_All for global edge locations
4. WHEN the CloudFront Distribution serves requests THEN the CloudFront Distribution SHALL allow GET, HEAD, and OPTIONS HTTP methods
