# Multi-Value Field Handling - MCP JPPR Server

## Overview

Puerto Rico properties can span multiple administrative or environmental boundaries, resulting in **percentage-based multi-value fields** from the MIPR API. This document explains how our server handles these complex property data scenarios.

## Multi-Value Field Types

### **Administrative Boundaries**
Properties that cross municipal or barrio boundaries receive percentage breakdowns:

- **`Muni_Multi`**: `"Trujillo Alto (97.1%), San Juan (2.9%)"`
- **`Barrio_Multi`**: `"Carraízo (97.1%), Cupey (2.9%)"`

### **Zoning & Land Use**
Properties with multiple zoning designations:

- **`Calificacion`**: `"R-I (97%), R-3 (2%), R-1 (1%)"` - Zoning types
- **`Clasificacion`**: `"SRC (99%), VIAL (1%)"` - Land classifications
- **`ClasificacionPUT`**: `"SRC (99%), VIAL (1%)"` - Territorial planning classifications

### **Environmental Characteristics**
Properties spanning different geological or soil conditions:

- **`Suelo_Geolo`**: `"HtF (66.4%), LsE (31.9%), HtE (1.6%)"` - Geological/soil types

## Data Structure

### **Parsed Breakdowns**
Each multi-value field is parsed into structured data:

```typescript
Array<{type: string, percentage: number}>

// Example:
[
  {type: "R-I", percentage: 97},
  {type: "R-3", percentage: 2}, 
  {type: "R-1", percentage: 1}
]
```

### **Synthetic Primary Fields**
For practical use, we generate synthetic fields representing the **dominant/primary** value (highest percentage):

```typescript
interface PropertyData {
  // Original multi-value strings
  municipality: string;    // "Trujillo Alto (97.1%), San Juan (2.9%)"
  zoning: string;         // "R-I (97%), R-3 (2%), R-1 (1%)"
  geology: string;        // "HtF (66.4%), LsE (31.9%), HtE (1.6%)"
  
  // Synthetic primary values (NEW)
  primaryMunicipality: string;    // "Trujillo Alto"
  primaryZoning: string;          // "R-I" 
  primaryGeology: string;         // "HtF"
  
  // Detailed breakdowns for analysis
  municipalityBreakdown: Array<{type: string, percentage: number}>;
  zoningBreakdown: Array<{type: string, percentage: number}>;
  geologyBreakdown: Array<{type: string, percentage: number}>;
}
```

## User Display Strategy

### **Primary Values First**
Property details display shows the **primary/dominant** values prominently:

```
**Municipality:** Trujillo Alto
**Barrio:** Carraízo  
**Primary Zoning:** R-I
**Primary Classification:** SRC
**Primary Geology:** HtF
```

### **Detailed Breakdowns**
When properties span multiple boundaries, detailed breakdowns are shown:

```
**Zoning Breakdown:**
   - R-I: 97%
   - R-3: 2%
   - R-1: 1%

**Geology Breakdown:**
   - HtF: 66.4%
   - LsE: 31.9%
   - HtE: 1.6%
```

## Real-World Examples

### **Example 1: Cross-Municipal Property**
**Catastro**: `115-045-609-05`
- **Location**: Property spans Trujillo Alto (97.1%) and San Juan (2.9%)
- **Primary Municipality**: Trujillo Alto
- **Primary Barrio**: Carraízo (from Carraízo 97.1%, Cupey 2.9%)
- **Zoning**: Mixed residential (R-I 97%, R-3 2%, R-1 1%)

### **Example 2: Multi-Geology Property**  
**Catastro**: `277-091-226-38`
- **Location**: Caguas, Barrio Borinquen
- **Geology**: Three soil types (HtF 66.4%, LsE 31.9%, HtE 1.6%)
- **Primary Geology**: HtF (dominant soil type)
- **Zoning**: Primarily R-G (99%) with road easements (VIAL 1%)

## Benefits for Users

### **1. Simplified Decision Making**
- **Primary values** provide clear, actionable information
- No need to interpret complex percentage strings

### **2. Detailed Analysis Available**
- **Breakdown arrays** support sophisticated analysis
- Percentage data enables area calculations and impact assessment

### **3. Regulatory Compliance**
- Understand which regulations apply and in what proportions
- Critical for permitting and development planning

### **4. Geographic Context**
- Properties spanning boundaries are clearly identified
- Helps explain complex zoning or jurisdictional situations

## Implementation Details

### **Parsing Algorithm**
```typescript
// Regex pattern handles comma-separated percentages
const regex = /([^(,]+?)\s*\((\d+(?:\.\d+)?)\%\)/g;

// Example input: "R-I (97%), R-3 (2%), R-1 (1%)"
// Parsed output: 
// [
//   {type: "R-I", percentage: 97},
//   {type: "R-3", percentage: 2},
//   {type: "R-1", percentage: 1}
// ]
```

### **Primary Value Selection**
```typescript
// Find highest percentage value
const primary = breakdown.reduce((prev, current) => 
  (current.percentage > prev.percentage) ? current : prev
);
```

### **Fallback Strategy**
```typescript
// Use primary if available, fallback to original
const displayValue = property.primaryZoning || property.zoning;
```

## Common Scenarios

### **1. VIAL (Road) Easements**
Many properties show `"Primary_Use (99%), VIAL (1%)"` indicating road easements through the property.

### **2. Municipal Boundaries**
Properties near municipal boundaries often span multiple jurisdictions, affecting:
- Tax obligations  
- Permitting authority
- Service provision

### **3. Geological Diversity**
Large properties may span multiple geological zones, important for:
- Foundation design
- Environmental assessments
- Agricultural planning

### **4. Mixed Zoning**
Properties in transition areas may have multiple zoning designations:
- Development opportunities
- Use restrictions
- Future planning implications

## Future Enhancements

### **Planned Improvements**
- **Area Calculations**: Calculate actual area for each zone/type
- **Regulatory Mapping**: Link each zone to applicable regulations
- **Visualization**: Generate maps showing zone distributions
- **Historical Analysis**: Track zoning changes over time

### **Advanced Use Cases**
- **Development Planning**: Optimize usage based on zone percentages
- **Environmental Impact**: Assess impact on different geological zones  
- **Tax Assessment**: Proportional calculations for cross-boundary properties
- **Infrastructure Planning**: Account for multi-jurisdictional requirements

---

**Implementation Status**: ✅ Complete and tested  
**Coverage**: All MIPR multi-value fields supported  
**Accuracy**: Primary value extraction validated across diverse properties  
**Performance**: Efficient parsing with graceful error handling 