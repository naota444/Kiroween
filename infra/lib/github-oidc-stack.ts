import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import { GITHUB_BRANCH, GITHUB_REPO, WEB_BUCKET_PREFIX } from './constants.js';

const OIDC_HOST = 'token.actions.githubusercontent.com';
const CDK_QUALIFIER = 'hnb659fds'; // CDK 既定のブートストラップ修飾子
const BOOTSTRAP_ROLE_KINDS = ['deploy', 'file-publishing', 'image-publishing', 'lookup'] as const;

/**
 * GitHub Actions (main ブランチ) が AWS を操作するための OIDC プロバイダーと IAM ロール。
 * ほかのスタックを参照せず、参照もされない。
 */
export class GithubOidcStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // 既存プロバイダーがあるアカウントでは、コンテキストで ARN を渡して取り込む
    const existingArn = this.node.tryGetContext('githubOidcProviderArn') as string | undefined;
    const provider = existingArn
      ? iam.OidcProviderNative.fromOidcProviderArn(this, 'GithubOidc', existingArn)
      : new iam.OidcProviderNative(this, 'GithubOidc', {
          url: `https://${OIDC_HOST}`,
          clientIds: ['sts.amazonaws.com'],
        });

    const role = new iam.Role(this, 'GithubActionsRole', {
      assumedBy: new iam.FederatedPrincipal(
        provider.oidcProviderArn,
        {
          StringEquals: {
            [`${OIDC_HOST}:aud`]: 'sts.amazonaws.com',
            [`${OIDC_HOST}:sub`]: `repo:${GITHUB_REPO}:ref:refs/heads/${GITHUB_BRANCH}`,
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
      maxSessionDuration: Duration.seconds(3600),
    });

    // 1. CDK ブートストラップロールの引き受け
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: BOOTSTRAP_ROLE_KINDS.map(
          (kind) =>
            `arn:${this.partition}:iam::${this.account}:role/cdk-${CDK_QUALIFIER}-${kind}-role-${this.account}-${this.region}`,
        ),
      }),
    );

    // 2. スタック出力の読み取り
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudformation:DescribeStacks'],
        resources: [
          `arn:${this.partition}:cloudformation:${this.region}:${this.account}:stack/DoodleNearby*/*`,
        ],
      }),
    );

    // 3. Web 用バケットへのアップロード
    const bucketArn = `arn:${this.partition}:s3:::${WEB_BUCKET_PREFIX}*`;
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:ListBucket', 's3:PutObject', 's3:DeleteObject', 's3:GetObject'],
        resources: [bucketArn, `${bucketArn}/*`],
      }),
    );

    // 4. CloudFront の無効化
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudfront:CreateInvalidation'],
        resources: [`arn:${this.partition}:cloudfront::${this.account}:distribution/*`],
      }),
    );

    new CfnOutput(this, 'GithubActionsRoleArn', {
      value: role.roleArn,
      description: 'Copy into the GitHub repository variable AWS_ROLE_ARN',
    });
    new CfnOutput(this, 'GithubOidcProviderArn', {
      value: provider.oidcProviderArn,
    });
  }
}
