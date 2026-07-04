# Equipment Rental System Architecture

## Master Entities

Equipment
Project
Operator
Customer
Rental
Assignment
Maintenance

---

## Relationships

Equipment
    |
    | projectId
    |
Project

Equipment
    |
    | operatorId
    |
Operator

Rental
    |
    | equipmentId
    |
Equipment

Assignment
    |
    | equipmentId
    |
Equipment

Assignment
    |
    | operatorId
    |
Operator

Assignment
    |
    | projectId
    |
Project

Maintenance
    |
    | equipmentId
    |
Equipment