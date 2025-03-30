import { createContext } from 'react';
import { MainStore } from './type';

export const Store = createContext<MainStore>(undefined);
