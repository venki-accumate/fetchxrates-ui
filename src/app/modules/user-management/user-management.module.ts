import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AccountComponent } from './account/account.component';
import { BillingComponent } from './billing/billing.component';
import { FeedbackComponent } from './feedback/feedback.component';
import { ReportIssueComponent } from './report-issue/report-issue.component';
import { SubscriptionCancellationComponent } from './subscription-cancellation/subscription-cancellation.component';

const routes: Routes = [
  { path: 'account',               component: AccountComponent },
  { path: 'billing',               component: BillingComponent },
  { path: 'feedback',              component: FeedbackComponent },
  { path: 'report-issue',          component: ReportIssueComponent },
  { path: 'cancel-subscription',   component: SubscriptionCancellationComponent },
  { path: '',                      redirectTo: 'account', pathMatch: 'full' },
];

@NgModule({
  imports: [
    RouterModule.forChild(routes),
    AccountComponent,
    BillingComponent,
    FeedbackComponent,
    ReportIssueComponent,
    SubscriptionCancellationComponent,
  ],
  exports: [RouterModule],
})
export class UserManagementModule {}
