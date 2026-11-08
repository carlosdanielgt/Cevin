/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { CevinWebApp } from './adapters/driving/web';
import { buildCevinContainer } from './main/index';

export default function App() {
  const useCases = useMemo(() => buildCevinContainer(), []);

  return (
    <BrowserRouter>
      <CevinWebApp useCases={useCases} />
    </BrowserRouter>
  );
}
