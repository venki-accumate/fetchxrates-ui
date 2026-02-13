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
    loadChildren: () => import('./modules/login/login.module').then(m => m.LoginModule)
  },
  {
    path: 'checkin',
    loadChildren: () => import('./modules/checkin/checkin.module').then(m => m.CheckinModule),
    canActivate: [authGuard]
  },
  {
    path: 'signup',
    loadChildren: () => import('./modules/checkin/checkin.module').then(m => m.CheckinModule)
  },
  {
    path: 'dashboard',
    loadChildren: () => import('./modules/dashboard/dashboard.module').then(m => m.DashboardModule),
    canActivate: [authGuard, subscriptionGuard]
  },
  {
    path: 'api',
    loadChildren: () => import('./modules/api/api.module').then(m => m.ApiModule),
    canActivate: [authGuard, subscriptionGuard]
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
