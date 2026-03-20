import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptors, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { AppRoutingModule } from './app-routing-module';
import { CookieConsentComponent } from './components/cookie-consent/cookie-consent.component';
import { AppComponent } from './app';
import { OutgoingInterceptor } from './interceptors/outgoing.interceptor';
import { BackendStatusInterceptor } from './interceptors/backend-status.interceptor';
import { SessionModalComponent } from './components/session-modal/session-modal.component';
import { MenuComponent } from './components/menu/menu.component';
import { NavbarComponent } from './components/navbar/navbar.component';
import { NotificationBannerComponent } from './components/notification-banner/notification-banner.component';
import { Amplify } from 'aws-amplify';
import { environment } from '../environments/environment';
import { provideZoneChangeDetection } from '@angular/core';
import { StripeSuccessComponent } from './components/stripe-success/stripe-success.component';
import { ButtonBarComponent } from './components/button-bar/button-bar.component';
import { ExcelReportComponent } from './components/excel-report/excel-report.component';
import { CsvReportComponent } from './components/csv-report/csv-report.component';
import { PdfReportComponent } from './components/pdf-report/pdf-report.component';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: "ap-southeast-2_SRiy44Zru", // Replace with your Cognito User Pool ID
      userPoolClientId: "33klpj4dlupav1frkv7ndfs5ag", // Replace with your Cognito Client ID
      identityPoolId: "ap-southeast-2:e6f8b7d4-46c1-4968-bc5e-2bef70abadd5", // Replace with your Identity Pool ID
      loginWith: {
        email: true,
        oauth: {
          domain: 'ap-southeast-2sriy44zru.auth.ap-southeast-2.amazoncognito.com', // Replace with your Cognito domain
          scopes: ['email', 'openid', 'profile'],
          redirectSignIn: [environment.loginRedirectUrl],
          redirectSignOut: [environment.loginRedirectUrl],
          responseType: 'code',
          providers: ['Google']
        }
      },
      signUpVerificationMethod: "code",
      userAttributes: {
        email: {
          required: true,
        },
      },
      allowGuestAccess: true,
      passwordFormat: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireNumbers: true,
        requireSpecialCharacters: true,
      }
    }
  }
});

@NgModule({
  declarations: [
    AppComponent,
    SessionModalComponent,
    MenuComponent,
    CookieConsentComponent,
    NotificationBannerComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    CommonModule,
    AppRoutingModule,
    MatSidenavModule,
    MatIconModule,
    MatListModule,
    MatSnackBarModule,
    NavbarComponent,
    StripeSuccessComponent,
    ButtonBarComponent,
    ExcelReportComponent,
    CsvReportComponent,
    PdfReportComponent
  ],
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: OutgoingInterceptor,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: BackendStatusInterceptor,
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }

