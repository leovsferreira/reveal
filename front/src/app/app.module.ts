import { NgModule } from '@angular/core';
import { AngularDraggableModule } from 'angular2-draggable';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AppRoutingModule } from './app-routing.module';
import { NgxSpinnerModule } from "ngx-spinner";
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { LightgalleryModule } from 'lightgallery/angular';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSliderModule } from '@angular/material/slider';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ModalModule, BsModalService } from 'ngx-bootstrap/modal'
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AppComponent } from './app.component';
import { ImageEmbeddingComponent } from './image-embedding/image-embedding.component';
import { TextEmbeddingComponent } from './text-embedding/text-embedding.component';
import { HomeComponent } from './home/home.component';
import { ApiService } from './shared/api.service';
import { GlobalService } from './shared/global.service';
import { SearchConfigComponent } from './search-config/search-config.component';
import { ForceGraphComponent } from './force-graph/force-graph.component';
import { ImageGalleryComponent } from './image-gallery/image-gallery.component';
import { ColorLegendComponent } from './color-legend/color-legend.component';
import { WordCloudComponent } from './word-cloud/word-cloud.component';

//firebase services
import { AngularFireModule } from '@angular/fire/compat';
import { AngularFireAuthModule } from '@angular/fire/compat/auth';
import { AngularFireStorage, AngularFireStorageModule } from '@angular/fire/compat/storage';
import { AngularFirestoreModule } from '@angular/fire/compat/firestore';
import { AngularFireDatabaseModule } from '@angular/fire/compat/database';
import { environment } from 'src/environments/environment';
import { SignInComponent } from './components/sign-in/sign-in.component';
import { SignUpComponent } from './components/sign-up/sign-up.component';
import { ForgotPasswordComponent } from './components/forgot-password/forgot-password.component';
import { VerifyEmailComponent } from './components/verify-email/verify-email.component';
import { AuthService } from './shared/services/auth.service';
import { BucketComponent } from './bucket/bucket.component';
import { StateComponent } from './state/state.component';
import { ModelGalleryComponent } from './model-gallery/model-gallery.component';

@NgModule({
  declarations: [
    AppComponent,
    ImageEmbeddingComponent,
    TextEmbeddingComponent,
    HomeComponent,
    SearchConfigComponent,
    ForceGraphComponent,
    ImageGalleryComponent,
    ColorLegendComponent,
    WordCloudComponent,
    SignInComponent,
    SignUpComponent,
    ForgotPasswordComponent,
    VerifyEmailComponent,
    BucketComponent,
    StateComponent,
    ModelGalleryComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    ReactiveFormsModule,
    AngularDraggableModule,
    BrowserAnimationsModule,
    LightgalleryModule,
    NgxSpinnerModule,
    MatSidenavModule,
    MatSliderModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatTooltipModule,
    AngularFireModule.initializeApp(environment.firebase),
    AngularFireAuthModule,
    AngularFirestoreModule,
    AngularFireStorageModule,
    AngularFireDatabaseModule,
    ModalModule
  ],
  providers: [ApiService, GlobalService, AuthService, BsModalService],
  bootstrap: [AppComponent]
})
export class AppModule { }
