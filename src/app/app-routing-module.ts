import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { subscriptionGuard } from './guards/subscription.guard';

const routes: Routes = [
  {
    path: '',
    redirectTo: '/dashboard', 
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadChildren: () => import('./modules/login/login.module').then(m => m.LoginModule),
    data: { hideLayout: true }
  },
  {
    path: 'checkin',  
    canActivate: [authGuard],
    loadChildren: () => import('./modules/checkin/checkin.module').then(m => m.CheckinModule),
    data: { hideLayout: true }
  },
  {
    path: 'signup',
    loadChildren: () => import('./modules/checkin/checkin.module').then(m => m.CheckinModule),
    data: { hideLayout: true }
  },
    {
    path: 'payment-success',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/stripe-success/stripe-success.component')
        .then(c => c.StripeSuccessComponent),
    data: { hideMenuItems: true }
  },
  {
    path: 'dashboard', 
    canActivate: [authGuard, subscriptionGuard],
    loadChildren: () => import('./modules/dashboard/dashboard.module').then(m => m.DashboardModule)
  },
  {
    path: 'api',
    canActivate: [authGuard, subscriptionGuard],
    loadChildren: () => import('./modules/api/api.module').then(m => m.ApiModule)
  },
  {
    path: 'user',
    canActivate: [authGuard, subscriptionGuard],
    loadChildren: () =>
      import('./modules/user-management/user-management.module')
        .then(m => m.UserManagementModule)
  },
  {
    path: '**',
    redirectTo: '/dashboard'
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
