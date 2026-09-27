// Padrão único para os seletores (filtros) de todas as abas: mesma altura,
// largura, fonte e cores, alinhados pela base numa linha só.

// Linha de filtros: 1/2 colunas no mobile, linha única (quebra só sem espaço) a partir de sm.
export const FILTER_ROW = 'grid grid-cols-1 min-[560px]:grid-cols-2 sm:flex sm:flex-wrap items-end justify-center gap-3 sm:gap-4';

// Bloco label + controle. Todos crescem igualmente entre 170px e 240px.
export const FILTER_FIELD = 'flex flex-col gap-1.5 min-w-0 col-span-1 sm:flex-1 sm:basis-[170px] sm:max-w-[240px]';

export const FILTER_LABEL = 'flex items-center gap-1.5 h-4 whitespace-nowrap text-xs font-medium text-text-secondary uppercase tracking-wider';

export const FILTER_CONTROL = 'h-[42px] w-full min-w-0 truncate bg-surface/60 backdrop-blur-md border border-border/50 rounded-xl px-4 text-sm font-medium text-text-primary hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

// Botões que ficam na mesma linha dos filtros.
export const FILTER_ACTION_HEIGHT = 'h-[42px]';
