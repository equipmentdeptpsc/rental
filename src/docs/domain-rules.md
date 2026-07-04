# Domain Rules

Equipment owns:

- assetNo

- equipmentName

- category

- maintenanceType

- currentReading

- projectId

- operatorId

- status

Project owns:

- projectName

- client

- location

Operator owns:

- name

- certification

- status

Customer owns:

- companyName

- contactPerson

Rental references

- equipmentId

- customerId

Assignment references

- equipmentId

- operatorId

- projectId

Maintenance references

- equipmentId