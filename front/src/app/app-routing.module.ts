import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { SignInComponent } from './components/sign-in/sign-in.component';
import { SignUpComponent } from './components/sign-up/sign-up.component';
import { ForgotPasswordComponent } from './components/forgot-password/forgot-password.component';
import { VerifyEmailComponent } from './components/verify-email/verify-email.component';
import { HomeComponent } from './home/home.component';
import { AuthGuard } from './shared/guard/auth.guard';
import { LoggedGuard } from './shared/guard/logged.guard';

const routes: Routes = [
  { path: '', redirectTo: '/sign-in', pathMatch: 'full' },
  { path: 'sign-in', component: SignInComponent, canActivate: [LoggedGuard] },
  { path: 'register-user', component: SignUpComponent, canActivate: [LoggedGuard] },
  { path: 'forgot-password', component: ForgotPasswordComponent, canActivate: [LoggedGuard] },
  { path: 'verify-email-address', component: VerifyEmailComponent, canActivate: [LoggedGuard] },
  { path: 'home', component: HomeComponent, canActivate: [AuthGuard]}
];
@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
