# Design Document

> **Retired (2026-07-27).** This spec describes the dedicated-subdomain hosting
> approach that was abandoned in dbf68d6. The app is now served as a subpath of
> the shared sumiya.page site via the root `deploy.sh`, and the `infrastructure/`
> directory this spec produced has been deleted along with its CloudFormation
> stacks. Kept for historical context only.

## Overview

This design document describes the architecture and implementation approach for deploying the options trading journal as a static website on AWS infrastructure. The solution uses AWS S3 for storage, CloudFront for content delivery, Route 53 for DNS management, and ACM for SSL/TLS certificates. All infrastructure is defined using CloudFormation templates, and deployment is automated through shell scripts.

The deployment system supports multiple environments (dev and production) using parameterized configurations, ensuring consistent and repeatable deployments while maintaining security best practices.

## Architecture

### High-Level Architecture

```
User Request
    ↓
Route 53 (DNS)
    ↓
CloudFront (CDN)
    ↓
S3 Bucket (Static Files)
```

### Component Interaction Flow

1. User enters subdomain URL (e.g., trading.example.com) in browser
2. Route 53 resolves DNS query and returns CloudFront distribution domain
3. CloudFront receives request and checks cache
4. If cache miss, CloudFront fetches content from S3 bucket via OAI
5. CloudFront serves content to user over HTTPS using ACM certificate
6. CloudFront caches content for subsequent requests

### Deployment Flow

1. Developer configures environment variables in .env file
2. Developer executes deployment script
3. Script validates CloudFormation template
4. Script deploys/updates CloudFormation stack
5. CloudFormation creates/updates AWS resources (S3, CloudFront, Route 53, ACM)
6. Script waits for stack completion
7. Script displays ACM certificate validation instructions (manual step)
8. Script waits for certificate validation
9. Script syncs website files to S3 bucket
10. Script invalidates CloudFront cache
11. Script displays deployment summary and next steps

## Components and Interfaces

### 1. CloudFormation Template (cloudformation.yaml)

**Purpose**: Define all AWS infrastructure as code

**Parameters**:
- `DomainName` (String): Root domain name (e.g., example.com)
- `Subdomain` (String): Subdomain prefix (e.g., trading, trading-dev)
- `BucketName` (String): S3 bucket name for static website hosting
- `Environment` (String): Environment name (production or dev)

**Resources**:
- `S3Bucket`: Static website hosting bucket
- `S3BucketPolicy`: Policy allowing CloudFront OAI access
- `CloudFrontOriginAccessIdentity`: Identity for CloudFront to access S3
- `CloudFrontDistribution`: CDN distribution
- `Route53HostedZone`: DNS hosted zone
- `Route53RecordSet`: A record alias to CloudFront
- `ACMCertificate`: SSL/TLS certificate for subdomain

**Outputs**:
- `S3BucketName`: Name of created S3 bucket
- `CloudFrontDistributionId`: CloudFront distribution ID
- `CloudFrontDomainName`: CloudFront distribution domain name
- `Route53NameServers`: Nameservers for domain registrar configuration
- `ACMCertificateArn`: ARN of ACM certificate
- `WebsiteURL`: Full website URL (https://subdomain.domain.com)

### 2. Deployment Script (deploy.sh)

**Purpose**: Automate infrastructure deployment and file synchronization

**Inputs**:
- Environment variables from .env file
- CloudFormation template file
- Website files to deploy

**Functions**:
- `load_env()`: Load and validate environment variables
- `validate_template()`: Validate CloudFormation template syntax
- `deploy_stack()`: Deploy or update CloudFormation stack
- `wait_for_stack()`: Wait for stack operation to complete
- `display_cert_validation()`: Show ACM certificate validation instructions
- `wait_for_cert_validation()`: Poll for certificate validation completion
- `sync_files()`: Upload website files to S3 bucket
- `invalidate_cache()`: Create CloudFront cache invalidation
- `display_summary()`: Show deployment results and next steps

**Outputs**:
- Console messages for deployment progress
- Stack outputs (bucket name, distribution ID, nameservers, etc.)
- Error messages if deployment fails

### 3. Infrastructure README (README.md)

**Purpose**: Document deployment process and configuration

**Sections**:
- Prerequisites
- Environment Setup
- Configuration Guide
- Deployment Steps
- ACM Certificate Validation
- Domain Nameserver Configuration
- Multi-Environment Setup
- Troubleshooting
- Rollback Procedures

### 4. Environment Configuration (.env)

**Purpose**: Store environment-specific configuration values

**Variables**:
```bash
DOMAIN_NAME=example.com
SUBDOMAIN=trading
S3_BUCKET_NAME=trading-example-com
ENVIRONMENT=production
AWS_REGION=us-east-1
AWS_PROFILE=default
STACK_NAME=static-website-${SUBDOMAIN}
```

## Data Models

### CloudFormation Stack Parameters

```yaml
Parameters:
  DomainName:
    Type: String
    Description: Root domain name
  Subdomain:
    Type: String
    Description: Subdomain prefix
  BucketName:
    Type: String
    Description: S3 bucket name for static website hosting
  Environment:
    Type: String
    Description: Environment name
    AllowedValues:
      - production
      - dev
```

### Environment Configuration Model

```typescript
interface DeploymentConfig {
  domainName: string;        // Root domain (e.g., example.com)
  subdomain: string;         // Subdomain prefix (e.g., trading)
  s3BucketName: string;      // S3 bucket name (e.g., trading-example-com)
  environment: string;       // production or dev
  awsRegion: string;         // AWS region (must be us-east-1 for ACM)
  awsProfile: string;        // AWS CLI profile name
  stackName: string;         // CloudFormation stack name
}
```

### CloudFormation Stack Outputs Model

```typescript
interface StackOutputs {
  s3BucketName: string;           // S3 bucket name
  cloudFrontDistributionId: string; // CloudFront distribution ID
  cloudFrontDomainName: string;   // CloudFront domain
  route53NameServers: string[];   // Route 53 nameservers
  acmCertificateArn: string;      // ACM certificate ARN
  websiteURL: string;             // Full website URL
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: CloudFormation template validation

*For any* CloudFormation template file, validating the template syntax should either succeed with no errors or fail with specific syntax error messages
**Validates: Requirements 6.2**

### Property 2: Environment variable loading

*For any* valid .env file containing required variables, loading the environment variables should result in all required configuration values being available to the deployment script
**Validates: Requirements 6.1, 10.1**

### Property 3: Stack deployment idempotency

*For any* CloudFormation stack, deploying the same template with the same parameters multiple times should result in the same infrastructure state
**Validates: Requirements 2.1, 6.3**

### Property 4: File exclusion during sync

*For any* file in the excluded directories (tests/, sample-data/, .git/, .kiro/, node_modules/), syncing files to S3 should not upload that file
**Validates: Requirements 1.2**

### Property 5: CloudFront cache invalidation

*For any* CloudFront distribution, creating a cache invalidation should result in subsequent requests fetching fresh content from the origin
**Validates: Requirements 6.5**

### Property 6: HTTPS redirect

*For any* HTTP request to the CloudFront distribution, the request should be redirected to HTTPS
**Validates: Requirements 4.1**

### Property 7: SPA routing support

*For any* request to the CloudFront distribution that results in a 403 or 404 error, the response should serve index.html with a 200 status code
**Validates: Requirements 1.5**

### Property 8: OAI access control

*For any* direct request to the S3 bucket URL, the request should be denied, while requests from CloudFront via OAI should succeed
**Validates: Requirements 5.1, 5.2**

### Property 9: Multi-environment isolation

*For any* two deployments with different environment parameters, the deployments should create separate S3 buckets with no shared resources
**Validates: Requirements 7.1, 7.2**

### Property 10: Parameter propagation

*For any* parameter passed to the CloudFormation stack, the parameter value should be correctly used in all resources that reference it
**Validates: Requirements 3.3, 3.4, 10.4**

## Error Handling

### CloudFormation Deployment Errors

**Stack Creation Failures**:
- Validate template before deployment
- Check AWS service quotas and limits
- Verify IAM permissions for all required services
- Display detailed error messages from CloudFormation events
- Provide rollback option to previous stack state

**Resource Creation Failures**:
- S3 bucket name conflicts: Suggest alternative bucket names
- ACM certificate validation timeout: Provide manual validation instructions
- Route 53 hosted zone conflicts: Check for existing hosted zones
- CloudFront distribution errors: Verify certificate and origin configuration

### Deployment Script Errors

**Environment Variable Errors**:
- Missing required variables: Display list of required variables
- Invalid variable values: Validate format and allowed values
- .env file not found: Provide instructions to create from .env.example

**AWS CLI Errors**:
- Authentication failures: Check AWS credentials and profile
- Permission denied: List required IAM permissions
- Region errors: Verify AWS_REGION is set to us-east-1 for ACM

**File Sync Errors**:
- S3 bucket not found: Verify stack deployment completed successfully
- Upload failures: Check network connectivity and file permissions
- Large file warnings: Suggest compression or CDN optimization

### ACM Certificate Validation Errors

**Validation Timeout**:
- Display current validation status
- Provide manual DNS record creation instructions
- Offer option to continue waiting or exit

**DNS Propagation Delays**:
- Explain DNS propagation can take up to 48 hours
- Provide commands to check DNS record status
- Suggest using DNS propagation checker tools

### CloudFront Cache Invalidation Errors

**Invalidation Failures**:
- Retry with exponential backoff
- Display invalidation status and progress
- Provide manual invalidation instructions via AWS console

## Testing Strategy

### Unit Testing

Unit tests will verify specific deployment script functions and CloudFormation template components:

**Deployment Script Tests**:
- Test environment variable loading with valid and invalid .env files
- Test CloudFormation template validation with valid and malformed templates
- Test file exclusion logic with various directory structures
- Test AWS CLI command construction with different parameters

**CloudFormation Template Tests**:
- Validate template syntax using AWS CLI
- Test parameter validation with valid and invalid values
- Verify resource dependencies are correctly defined
- Check output values are properly referenced

**Test Examples**:
- Loading .env file with all required variables should succeed
- Loading .env file with missing DOMAIN_NAME should fail with specific error
- Validating syntactically correct CloudFormation template should succeed
- Syncing files should exclude tests/ directory
- Syncing files should include index.html

### Property-Based Testing

Property-based tests will verify universal properties across all valid inputs using a property-based testing framework. Since this is infrastructure code primarily written in YAML and Bash, we'll use shell-based property testing where applicable, and manual verification for CloudFormation properties.

**Testing Framework**: For shell scripts, we'll use `shunit2` or `bats` (Bash Automated Testing System) for unit tests, and manual verification for CloudFormation properties.

**Test Configuration**: Each property-based test should run a minimum of 100 iterations to ensure comprehensive coverage of the input space.

**Test Tagging**: Each property-based test must include a comment explicitly referencing the correctness property from this design document using the format: `# Feature: infrastructure, Property {number}: {property_text}`

**Property Test Coverage**:

1. **Property 1 Test**: CloudFormation template validation
   - Generate various CloudFormation templates (valid and invalid)
   - Verify validation succeeds for valid templates and fails for invalid ones
   - Tag: `# Feature: infrastructure, Property 1: CloudFormation template validation`

2. **Property 2 Test**: Environment variable loading
   - Generate various .env files with different variable combinations
   - Verify all required variables are loaded correctly
   - Tag: `# Feature: infrastructure, Property 2: Environment variable loading`

3. **Property 4 Test**: File exclusion during sync
   - Generate various file structures with excluded directories
   - Verify excluded files are never uploaded to S3
   - Tag: `# Feature: infrastructure, Property 4: File exclusion during sync`

4. **Property 10 Test**: Parameter propagation
   - Generate various parameter combinations
   - Verify parameters are correctly used in all resources
   - Tag: `# Feature: infrastructure, Property 10: Parameter propagation`

**Integration Testing**:

Integration tests will verify the complete deployment workflow in a test AWS account:

- Deploy complete stack with test parameters
- Verify all resources are created correctly
- Upload test files and verify accessibility
- Test HTTPS redirect and SPA routing
- Test multi-environment deployment
- Verify cleanup and rollback procedures

**Manual Verification**:

Some properties require manual verification due to the nature of infrastructure deployment:

- Property 3 (Stack deployment idempotency): Deploy same stack twice and verify no changes
- Property 6 (HTTPS redirect): Test HTTP request manually and verify redirect
- Property 7 (SPA routing support): Test 404 paths and verify index.html is served
- Property 8 (OAI access control): Test direct S3 access and CloudFront access
- Property 9 (Multi-environment isolation): Deploy to dev and production, verify separation

## Security Considerations

### S3 Bucket Security

- Block all public access at bucket level
- Use bucket policy to restrict access to CloudFront OAI only
- Enable versioning for audit trail and rollback capability
- No sensitive data stored in bucket (all configs externalized)
- Server-side encryption enabled by default (AES-256)

### CloudFront Security

- Force HTTPS for all connections (redirect HTTP to HTTPS)
- Use TLS 1.2 or higher for SSL/TLS connections
- Restrict access to S3 origin using OAI
- Consider adding AWS WAF for additional protection against common web exploits
- Consider adding security headers via Lambda@Edge (Content-Security-Policy, X-Frame-Options, etc.)

### Secrets Management

- Never commit .env file to version control
- Use AWS Systems Manager Parameter Store or Secrets Manager for sensitive values in production
- Rotate AWS access keys regularly
- Use IAM roles with least privilege principle
- Enable CloudTrail for audit logging of all AWS API calls

### Certificate Management

- ACM certificates auto-renew before expiration
- Monitor certificate expiration via CloudWatch alarms
- Use DNS validation (more secure than email validation)
- Certificate must be in us-east-1 region for CloudFront

## Deployment Configuration

### Supported Configurations

**Domain Support**:
- Subdomain only (e.g., trading.example.com)
- Root domain not supported in this design

**Environments**:
- Production: Uses production subdomain (e.g., trading.example.com)
- Dev: Uses dev subdomain (e.g., trading-dev.example.com)
- Both environments use separate S3 buckets in same AWS account

**AWS Regions**:
- Primary region: us-east-1 (required for ACM certificates used with CloudFront)
- S3 bucket can be in any region, but us-east-1 recommended for consistency

**CloudFront Configuration**:
- Price Class: PriceClass_All (all edge locations globally)
- Default TTL: 86400 seconds (1 day)
- Compression: Enabled
- HTTP Methods: GET, HEAD, OPTIONS

**S3 Configuration**:
- Versioning: Enabled
- Access Logging: Disabled (cost optimization)
- Static Website Hosting: Enabled
- Index Document: index.html
- Error Document: index.html

### File Deployment Strategy

**Included Files**:
- index.html
- css/ directory and all contents
- js/ directory and all contents (including visualizations/)
- lib/ directory and all contents
- assets/ directory and all contents

**Excluded Files**:
- tests/ directory
- sample-data/ directory
- .git/ directory
- .kiro/ directory
- infrastructure/ directory
- node_modules/ directory
- .env file
- .gitignore file
- README.md (project README, not infrastructure README)

## Rollback Strategy

### Version Rollback

1. S3 versioning enabled - can restore previous file versions
2. CloudFormation stack updates can be rolled back automatically on failure
3. CloudFront invalidation allows immediate cache clearing for updates

### Rollback Procedures

**File-Level Rollback**:
```bash
# List object versions
aws s3api list-object-versions --bucket <bucket-name> --prefix <file-path>

# Restore specific version
aws s3api copy-object --bucket <bucket-name> --copy-source <bucket-name>/<file-path>?versionId=<version-id> --key <file-path>

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id <dist-id> --paths "/*"
```

**Stack-Level Rollback**:
```bash
# Rollback to previous stack version
aws cloudformation cancel-update-stack --stack-name <stack-name>

# Or delete and recreate stack
aws cloudformation delete-stack --stack-name <stack-name>
# Then redeploy with previous template version
```

### Disaster Recovery

- Maintain CloudFormation templates in version control
- Keep backup of .env configuration files (securely)
- Document manual steps (nameserver configuration, certificate validation)
- Test rollback procedures regularly
- Maintain deployment runbook with step-by-step recovery instructions

## Monitoring and Maintenance

### CloudWatch Metrics

**CloudFront Metrics** (available by default):
- Requests: Total number of requests
- BytesDownloaded: Total bytes served
- 4xxErrorRate: Client error rate
- 5xxErrorRate: Server error rate

**S3 Metrics** (enable request metrics if needed):
- NumberOfObjects: Total objects in bucket
- BucketSizeBytes: Total bucket size

### Recommended Alarms

- CloudFront 5xx error rate > 5% for 5 minutes
- CloudFront 4xx error rate > 20% for 5 minutes
- Unusual spike in requests (potential DDoS)
- S3 bucket size exceeds expected threshold

### Maintenance Tasks

**Regular Tasks**:
- Review CloudWatch metrics weekly
- Check ACM certificate expiration (should auto-renew)
- Review CloudFront cache hit ratio and adjust TTL if needed
- Audit IAM permissions quarterly
- Review and update security headers

**As-Needed Tasks**:
- Update CloudFormation template for infrastructure changes
- Rotate AWS access keys
- Update deployment scripts for new features
- Review and optimize CloudFront costs

## Cost Optimization

### CloudFront Optimization

- Use appropriate cache TTL to maximize cache hit ratio
- Enable compression to reduce data transfer
- Consider using PriceClass_100 or PriceClass_200 if users are regional
- Monitor and analyze CloudFront usage patterns

### S3 Optimization

- Compress assets before upload (gzip/brotli)
- Use S3 lifecycle policies to transition old versions to cheaper storage classes
- Delete old object versions after retention period
- Monitor bucket size and clean up unused files

### General Cost Management

- Use AWS Cost Explorer to track spending
- Set up billing alarms for unexpected cost increases
- Review and optimize resource usage monthly
- Consider Reserved Capacity for predictable workloads

