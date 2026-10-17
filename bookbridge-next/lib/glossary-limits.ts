// A book's glossary holds at most this many terms (each name and alias is
// one). Consistent names rarely need more than ~100; the Worker's scan prunes
// to the same cap (MAX_GLOSSARY_TERMS in bookbridge/harness/prescan.py).
export const MAX_GLOSSARY_TERMS = 200
