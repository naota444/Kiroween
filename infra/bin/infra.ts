import { App, Stack } from 'aws-cdk-lib';

const app = new App();
// cdk synth はスタックが0個だと失敗するため、空の仮スタックを置く。
// タスク 6.2 で GithubOidcStack に置き換える。
// 名前は CD の対象 'DoodleNearby*' に一致させない。
new Stack(app, 'SkeletonPlaceholder');
app.synth();
