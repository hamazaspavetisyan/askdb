import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
    ConnectRequestDto,
    ConnectResponseDto,
    ListCollectionsResponseDto,
    QueryRequestDto,
    QueryResponseDto
} from '@mongo-mpc/shared';

/** Base URL of the NestJS API. */
export const API_BASE = 'http://localhost:3000/api';

@Injectable({ providedIn: 'root' })
export class ApiService {
    private readonly http = inject(HttpClient);

    connect(body: ConnectRequestDto): Observable<ConnectResponseDto> {
        return this.http.post<ConnectResponseDto>(
            `${API_BASE}/connection`,
            body
        );
    }

    disconnect(sessionId: string): Observable<void> {
        return this.http.delete<void>(`${API_BASE}/connection/${sessionId}`);
    }

    query(body: QueryRequestDto): Observable<QueryResponseDto> {
        return this.http.post<QueryResponseDto>(`${API_BASE}/query`, body);
    }

    listCollections(
        sessionId: string,
        database: string
    ): Observable<ListCollectionsResponseDto> {
        return this.http.get<ListCollectionsResponseDto>(
            `${API_BASE}/query/collections`,
            { params: { sessionId, database } }
        );
    }
}
