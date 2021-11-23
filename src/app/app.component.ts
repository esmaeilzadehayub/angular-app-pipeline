import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'angular-app-example';

  notTestedMethod(): void {
    console.log('Coverage should be red in MR');
  }
}
