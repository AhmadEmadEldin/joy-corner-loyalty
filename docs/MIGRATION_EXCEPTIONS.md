# Migration Exceptions

The verified migration retained 151 explicit exception events. No source row
was silently discarded.

| Code                              | Count | Treatment                                                                                                     |
| --------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------- |
| MENU_SIZE_LABEL_UNPROVEN          |    37 | Preserved menu text; owner must confirm labels.                                                               |
| MENU_PRICE_UNRESOLVED             |    14 | Preserved record and blocked guessing a trusted price.                                                        |
| ORPHAN_ORDER_ITEM                 |    23 | Recovered by deterministic legacy order derivation; final orphan count is zero.                               |
| ORPHAN_PAYMENT                    |    67 | Preserved as immutable payment transactions without inventing an order link.                                  |
| LOYALTY_OPENING_BALANCE           |     4 | Preserved as typed opening-balance ledger records.                                                            |
| DUPLICATE_PROVEN_ORDER_ID_GROUPED |     6 | Grouped only where the non-empty legacy order ID proved common identity; amounts and item counts were summed. |

The six grouped rows belonged to four order IDs. After grouping, order IDs and
client request IDs are unique. The 67 orphan payments remain a deliberate
review queue because guessed financial links would be worse than explicit
exceptions.
