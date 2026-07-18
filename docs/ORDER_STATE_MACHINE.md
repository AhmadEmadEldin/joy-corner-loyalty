# Order state machine

```mermaid
flowchart LR
  Requested -->|staff requests confirmation| Awaiting[Awaiting Confirmation]
  Awaiting -->|customer confirms| Confirmed
  Confirmed -->|manager/cashier approves| Approved
  Approved -->|barista accepts| Accepted
  Accepted --> Preparing
  Preparing --> Ready
  Ready --> Picked[Picked Up]
  Picked --> Completed
  Requested --> Cancelled
  Awaiting --> Cancelled
  Confirmed --> Rejected
  Confirmed --> Cancelled
  Approved --> Rejected
  Approved --> Cancelled
```

The backend is authoritative. Customer confirmation and cancellation require ownership of the order. Late cancellation requires a reason and manager-level authority. Payment state is independent from order state. Legacy values are normalized only when reading; new writes use canonical labels.
