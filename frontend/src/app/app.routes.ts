import { Routes } from '@angular/router';
import { ConnectComponent } from './features/connect/connect.component';
import { QueryComponent } from './features/query/query.component';

export const routes: Routes = [
    { path: '', component: ConnectComponent },
    { path: 'query', component: QueryComponent },
    { path: '**', redirectTo: '' }
];
