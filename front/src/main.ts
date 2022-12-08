import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';
import { registerLicense } from '@syncfusion/ej2-base';

registerLicense('Mgo+DSMBaFt/QHFqVVhkW1pFdEBBXHxAd1p/VWJYdVt5flBPcDwsT3RfQF9jTHxWd01mWX9bcHdQTg==;Mgo+DSMBPh8sVXJ0S0d+XE9AcVRDX3xKf0x/TGpQb19xflBPallYVBYiSV9jS3xTc0dmWHdbcHRQRmRbWQ==;ORg4AjUWIQA/Gnt2VVhhQlFaclhJXGFWfVJpTGpQdk5xdV9DaVZUTWY/P1ZhSXxRdkBhXH5WdXRVQ2BZWUw=;NjQ1NDI1QDMyMzAyZTMxMmUzMExDdkNGZTd0dWw0UlhLenNoY3A5N3Nab0d0c0pMQ0F0NWpWSHRPRkFoejg9;NjQ1NDI2QDMyMzAyZTMxMmUzMGtXZkRwM1l1WElWeXF0M0pRbmFmZEM5czIxYjZQek9wMklVOXlzM1VHNFk9;NRAiBiAaIQQuGjN/V0Z+XU9EaFtFVmJLYVB3WmpQdldgdVRMZVVbQX9PIiBoS35RdEVmW3pfeHFVRmVdU0R+;NjQ1NDI4QDMyMzAyZTMxMmUzMGp0TXd6YmtjSzJVc0N3L0hSYVNjQXowTDB5TTBUVGljVW1laDZCOGNhN0U9;NjQ1NDI5QDMyMzAyZTMxMmUzMFFmczQ2TDJKRDJxckJBVTlkekJOOWRjRFdWeWwrN1NxUUIvYTZFMUwrdzA9;Mgo+DSMBMAY9C3t2VVhhQlFaclhJXGFWfVJpTGpQdk5xdV9DaVZUTWY/P1ZhSXxRdkBhXH5WdXRVQ2FUU0c=;NjQ1NDMxQDMyMzAyZTMxMmUzMGNRTFVHRnJTeXc3TWNuUCtTenR4RU1acTdxQTFybVpFTXluWktDYzQ3VGM9;NjQ1NDMyQDMyMzAyZTMxMmUzMFI5dzJHTHhiK1gxeEwxR0kzalA2dnQ2b0ZvT3RhRElJcmQxWjhMVmNmck09');

if (environment.production) {
  enableProdMode();
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));
