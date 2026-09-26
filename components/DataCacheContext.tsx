'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import type { DepartmentDocument, UserDocument, ClientDocument, ScopeDocument } from '@/lib/firebase';

interface DataCacheContextType {
  departments: DepartmentDocument[] | null;
  setCachedDepartments: (depts: DepartmentDocument[]) => void;
  employees: UserDocument[] | null;
  setCachedEmployees: (emps: UserDocument[]) => void;
  clients: ClientDocument[] | null;
  setCachedClients: (clients: ClientDocument[]) => void;
  scopes: ScopeDocument[] | null;
  setCachedScopes: (scopes: ScopeDocument[]) => void;
  invalidateCache: (key?: 'departments' | 'employees' | 'clients' | 'scopes' | 'all') => void;
}

const DataCacheContext = createContext<DataCacheContextType>({
  departments: null,
  setCachedDepartments: () => {},
  employees: null,
  setCachedEmployees: () => {},
  clients: null,
  setCachedClients: () => {},
  scopes: null,
  setCachedScopes: () => {},
  invalidateCache: () => {},
});

export const useDataCache = () => useContext(DataCacheContext);

export function DataCacheProvider({ children }: { children: React.ReactNode }) {
  const [departments, setDepartments] = useState<DepartmentDocument[] | null>(null);
  const [employees, setEmployees] = useState<UserDocument[] | null>(null);
  const [clients, setClients] = useState<ClientDocument[] | null>(null);
  const [scopes, setScopes] = useState<ScopeDocument[] | null>(null);

  const setCachedDepartments = useCallback((depts: DepartmentDocument[]) => {
    setDepartments(depts);
  }, []);

  const setCachedEmployees = useCallback((emps: UserDocument[]) => {
    setEmployees(emps);
  }, []);

  const setCachedClients = useCallback((cls: ClientDocument[]) => {
    setClients(cls);
  }, []);

  const setCachedScopes = useCallback((scs: ScopeDocument[]) => {
    setScopes(scs);
  }, []);

  const invalidateCache = useCallback((key?: 'departments' | 'employees' | 'clients' | 'scopes' | 'all') => {
    if (!key || key === 'all') {
      setDepartments(null);
      setEmployees(null);
      setClients(null);
      setScopes(null);
      return;
    }
    if (key === 'departments') setDepartments(null);
    if (key === 'employees') setEmployees(null);
    if (key === 'clients') setClients(null);
    if (key === 'scopes') setScopes(null);
  }, []);

  return (
    <DataCacheContext.Provider
      value={{
        departments,
        setCachedDepartments,
        employees,
        setCachedEmployees,
        clients,
        setCachedClients,
        scopes,
        setCachedScopes,
        invalidateCache,
      }}
    >
      {children}
    </DataCacheContext.Provider>
  );
}
