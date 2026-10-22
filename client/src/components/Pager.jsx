import React from 'react';
import { Button } from './ui.jsx';

export default function Pager({ page, totalPages, from, to, total, onPage }) {
  if (totalPages <= 1) return null;
  return (
    <div className="pagination">
      <span>{from}–{to} de {total}</span>
      <div className="row">
        <Button size="sm" icon="chevronL" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</Button>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{page} / {totalPages}</span>
        <Button size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Siguiente <svg className="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </Button>
      </div>
    </div>
  );
}
