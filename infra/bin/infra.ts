import { App } from 'aws-cdk-lib';
import { GithubOidcStack } from '../lib/github-oidc-stack.js';

const app = new App();

// アカウントと Region の両方があるときだけ env を渡す。
// 未設定なら環境非依存のスタックになり、認証なしで synth できる。
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION;
const env = account && region ? { account, region } : undefined;

new GithubOidcStack(app, 'GithubOidcStack', { env });

app.synth();
