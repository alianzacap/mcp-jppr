import { 
  type McpToolDefinition, 
  type McpToolHandler,
  createSuccessResult,
  createErrorResult
} from '@angusdavis2/mcp-framework';
import { z } from 'zod';
import { MiprApiClient, type PropertySearchParams } from './mipr-api-client.js';

// Initialize the MIPR API client
const miprClient = new MiprApiClient();

// Property search tool
export const searchPropertiesDefinition: McpToolDefinition = {
  name: 'search_properties',
  description: 'Search for properties in Puerto Rico by Catastro number or coordinates (latitude/longitude)',
  inputSchema: z.object({
    parcelId: z.string().optional().describe('Property Catastro (parcel) identification number'),
    latitude: z.number().optional().describe('Latitude coordinate for location-based search'),
    longitude: z.number().optional().describe('Longitude coordinate for location-based search'),
    limit: z.number().optional().default(10).describe('Maximum number of results to return (default: 10)')
  })
};

export const searchPropertiesHandler: McpToolHandler = async (args: any) => {
  try {
    const { parcelId, latitude, longitude, limit = 10 } = args;

    // Validate that at least one search parameter is provided
    if (!parcelId && (!latitude || !longitude)) {
      return createErrorResult('Either a Catastro number (parcelId) or coordinates (latitude and longitude) must be provided.');
    }

    const searchParams: PropertySearchParams = {};
    if (parcelId) searchParams.parcelId = parcelId;
    if (latitude && longitude) {
      searchParams.latitude = latitude;
      searchParams.longitude = longitude;
    }

    const properties = await miprClient.searchProperties(searchParams);
    const limitedProperties = properties.slice(0, limit);

    if (limitedProperties.length === 0) {
      let message = 'No properties found matching the search criteria.\n\n';
      
      if (parcelId) {
        message += `The Catastro number "${parcelId}" was not found in the MIPR database.\n`;
        message += 'This could mean:\n';
        message += '- The Catastro number does not exist\n';
        message += '- The property is not yet registered or is inactive\n';
        message += '- There may be a typo in the number\n\n';
        message += 'Please verify the Catastro number and try again.';
      } else if (latitude && longitude) {
        message += `No property found at coordinates ${latitude}, ${longitude}.\n`;
        message += 'This could mean:\n';
        message += '- The coordinates are in a non-developed area (water, forest, etc.)\n';
        message += '- The coordinates are outside Puerto Rico\n';
        message += '- The property at this location is not in the MIPR database\n\n';
        message += 'Please verify the coordinates and try again.';
      } else {
        message += 'Please try different search criteria.';
      }
      
      return createSuccessResult(message);
    }

    let resultText = `Found ${limitedProperties.length} propert${limitedProperties.length === 1 ? 'y' : 'ies'}:\n\n`;
    
    limitedProperties.forEach((property, index) => {
      resultText += `${index + 1}. **${property.address}**\n`;
      resultText += `   - Catastro (Parcel ID): ${property.parcelId}\n`;
      resultText += `   - Municipality: ${property.municipality}\n`;
      if (property.barrio) resultText += `   - Barrio: ${property.barrio}\n`;
      resultText += `   - Zone: ${property.zone}\n`;
      resultText += `   - Land Use: ${property.landUse}\n`;
      if (property.zoning) resultText += `   - Zoning: ${property.zoning}\n`;
      if (property.classification) resultText += `   - Classification: ${property.classification}\n`;
      resultText += `   - Area: ${property.area.toFixed(2)} sq meters\n`;
      resultText += `   - Coordinates: ${property.coordinates.latitude}, ${property.coordinates.longitude}\n`;
      if (property.coordinates_projected) {
        resultText += `   - Projected Coords: ${property.coordinates_projected.x.toFixed(2)}, ${property.coordinates_projected.y.toFixed(2)}\n`;
      }
      if (property.floodZone) resultText += `   - Flood Zone: ${property.floodZone}\n`;
      if (property.geology) resultText += `   - Geology: ${property.geology}\n`;
      if (property.owner) resultText += `   - Owner: ${property.owner}\n`;
      if (property.assessedValue) resultText += `   - Assessed Value: $${property.assessedValue.toLocaleString()}\n`;
      resultText += '\n';
    });

    return createSuccessResult(resultText);
  } catch (error) {
    return createErrorResult(`Failed to search properties: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Get property details tool
export const getPropertyDetailsDefinition: McpToolDefinition = {
  name: 'get_property_details',
  description: 'Get detailed information about a specific property using its parcel ID',
  inputSchema: z.object({
    parcelId: z.string().describe('Property parcel identification number')
  })
};

export const getPropertyDetailsHandler: McpToolHandler = async (args: any) => {
  try {
    const { parcelId } = args;
    
    const property = await miprClient.getPropertyDetails(parcelId);
    
    if (!property) {
      return createSuccessResult(`No property found with Catastro number: ${parcelId}\n\nThis could mean:\n- The Catastro number does not exist in the MIPR database\n- The property is not yet registered or is inactive\n- There may be a typo in the Catastro number\n\nPlease verify the Catastro number and try again.`);
    }

    let resultText = `**Property Details for Catastro ${property.parcelId}**\n\n`;
    resultText += `**Address:** ${property.address}\n`;
    
    // Use primary values when available, fallback to original values
    const displayMunicipality = property.primaryMunicipality || property.municipality;
    const displayBarrio = property.primaryBarrio || property.barrio;
    const displayZoning = property.primaryZoning || property.zoning;
    const displayClassification = property.primaryClassification || property.classification;
    const displayGeology = property.primaryGeology || property.geology;
    
    resultText += `**Municipality:** ${displayMunicipality}\n`;
    if (displayBarrio) resultText += `**Barrio:** ${displayBarrio}\n`;
    resultText += `**Zone:** ${property.zone}\n`;
    resultText += `**Land Use:** ${property.landUse}\n`;
    if (displayZoning) resultText += `**Primary Zoning:** ${displayZoning}\n`;
    if (displayClassification) resultText += `**Primary Classification:** ${displayClassification}\n`;
    resultText += `**Area:** ${property.area.toFixed(2)} sq meters\n`;
    resultText += `**Coordinates (WGS84):** ${property.coordinates.latitude}, ${property.coordinates.longitude}\n`;
    if (property.coordinates_projected) {
      resultText += `**Projected Coordinates (State Plane):** ${property.coordinates_projected.x.toFixed(2)}, ${property.coordinates_projected.y.toFixed(2)}\n`;
    }
    if (property.floodZone) resultText += `**Flood Zone:** ${property.floodZone}\n`;
    if (displayGeology) resultText += `**Primary Geology:** ${displayGeology}\n`;
    
    // Add multi-value breakdowns if property spans boundaries
    if (property.municipalityBreakdown && property.municipalityBreakdown.length > 1) {
      resultText += `**Municipality Breakdown:**\n`;
      property.municipalityBreakdown.forEach(item => {
        resultText += `   - ${item.type}: ${item.percentage}%\n`;
      });
    }
    
    if (property.barrioBreakdown && property.barrioBreakdown.length > 1) {
      resultText += `**Barrio Breakdown:**\n`;
      property.barrioBreakdown.forEach(item => {
        resultText += `   - ${item.type}: ${item.percentage}%\n`;
      });
    }
    
    if (property.zoningBreakdown && property.zoningBreakdown.length > 1) {
      resultText += `**Zoning Breakdown:**\n`;
      property.zoningBreakdown.forEach(item => {
        resultText += `   - ${item.type}: ${item.percentage}%\n`;
      });
    }
    
    if (property.classificationBreakdown && property.classificationBreakdown.length > 1) {
      resultText += `**Classification Breakdown:**\n`;
      property.classificationBreakdown.forEach(item => {
        resultText += `   - ${item.type}: ${item.percentage}%\n`;
      });
    }
    
    if (property.geologyBreakdown && property.geologyBreakdown.length > 1) {
      resultText += `**Geology Breakdown:**\n`;
      property.geologyBreakdown.forEach(item => {
        resultText += `   - ${item.type}: ${item.percentage}%\n`;
      });
    }
    
    if (property.permittedUses && property.permittedUses.length > 0) {
      resultText += `**Permitted Uses:** \n`;
      property.permittedUses.slice(0, 10).forEach(use => {
        resultText += `   - ${use}\n`;
      });
      if (property.permittedUses.length > 10) {
        resultText += `   - ... and ${property.permittedUses.length - 10} more\n`;
      }
    }
    if (property.owner) resultText += `**Owner:** ${property.owner}\n`;
    if (property.assessedValue) resultText += `**Assessed Value:** $${property.assessedValue.toLocaleString()}\n`;

    return createSuccessResult(resultText);
  } catch (error) {
    return createErrorResult(`Failed to get property details: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Get municipalities tool
export const getMunicipalitiesDefinition: McpToolDefinition = {
  name: 'get_municipalities',
  description: 'Get a list of all municipalities in Puerto Rico available in the MIPR system',
  inputSchema: z.object({})
};

export const getMunicipalitiesHandler: McpToolHandler = async (args: any) => {
  try {
    const municipalities = await miprClient.getMunicipalities();
    
    let resultText = `**Puerto Rico Municipalities (${municipalities.length} total):**\n\n`;
    
    // Group municipalities in columns for better readability
    const columns = 3;
    const itemsPerColumn = Math.ceil(municipalities.length / columns);
    
    for (let i = 0; i < itemsPerColumn; i++) {
      let row = '';
      for (let col = 0; col < columns; col++) {
        const index = col * itemsPerColumn + i;
        if (index < municipalities.length) {
          row += `${municipalities[index].padEnd(20)} `;
        }
      }
      resultText += row.trim() + '\n';
    }

    return createSuccessResult(resultText);
  } catch (error) {
    return createErrorResult(`Failed to get municipalities: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Properties in area tool
export const getPropertiesInAreaDefinition: McpToolDefinition = {
  name: 'get_properties_in_area',
  description: 'Get properties within a specified geographic bounding box (rectangular area)',
  inputSchema: z.object({
    minLatitude: z.number().describe('Minimum latitude of the bounding box'),
    minLongitude: z.number().describe('Minimum longitude of the bounding box'),
    maxLatitude: z.number().describe('Maximum latitude of the bounding box'),
    maxLongitude: z.number().describe('Maximum longitude of the bounding box'),
    limit: z.number().optional().default(20).describe('Maximum number of properties to return (default: 20)')
  })
};

export const getPropertiesInAreaHandler: McpToolHandler = async (args: any) => {
  try {
    const { minLatitude, minLongitude, maxLatitude, maxLongitude, limit = 20 } = args;

    // Validate bounding box
    if (minLatitude >= maxLatitude || minLongitude >= maxLongitude) {
      return createErrorResult('Invalid bounding box: minimum values must be less than maximum values');
    }

    const bbox: [number, number, number, number] = [minLongitude, minLatitude, maxLongitude, maxLatitude];
    const properties = await miprClient.getPropertiesInBounds(bbox);
    const limitedProperties = properties.slice(0, limit);

    if (limitedProperties.length === 0) {
      return createSuccessResult('No properties found in the specified area.');
    }

    let resultText = `Found ${limitedProperties.length} propert${limitedProperties.length === 1 ? 'y' : 'ies'} in the specified area:\n\n`;
    resultText += `**Bounding Box:** (${minLatitude}, ${minLongitude}) to (${maxLatitude}, ${maxLongitude})\n\n`;
    
    limitedProperties.forEach((property, index) => {
      resultText += `${index + 1}. **${property.address}**\n`;
      resultText += `   - Parcel ID: ${property.parcelId}\n`;
      resultText += `   - Municipality: ${property.municipality}\n`;
      resultText += `   - Coordinates: ${property.coordinates.latitude}, ${property.coordinates.longitude}\n`;
      resultText += `   - Land Use: ${property.landUse}\n`;
      resultText += '\n';
    });

    return createSuccessResult(resultText);
  } catch (error) {
    return createErrorResult(`Failed to get properties in area: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Convert coordinates tool
export const convertCoordinatesDefinition: McpToolDefinition = {
  name: 'convert_coordinates',
  description: 'Convert coordinates between different coordinate systems commonly used in Puerto Rico',
  inputSchema: z.object({
    latitude: z.number().describe('Latitude coordinate to convert'),
    longitude: z.number().describe('Longitude coordinate to convert'),
    fromSystem: z.enum(['WGS84', 'NAD83', 'StatePlane']).optional().default('WGS84').describe('Source coordinate system'),
    toSystem: z.enum(['WGS84', 'NAD83', 'StatePlane']).optional().default('WGS84').describe('Target coordinate system')
  })
};

export const convertCoordinatesHandler: McpToolHandler = async (args: any) => {
  try {
    const { latitude, longitude, fromSystem = 'WGS84', toSystem = 'WGS84' } = args;

    const convertedCoords = await miprClient.convertCoordinates(latitude, longitude, fromSystem, toSystem);

    let resultText = `**Coordinate Conversion**\n\n`;
    resultText += `**Original (${fromSystem}):** ${latitude}, ${longitude}\n`;
    resultText += `**Converted (${toSystem}):** ${convertedCoords.latitude}, ${convertedCoords.longitude}\n\n`;
    
    if (fromSystem === toSystem) {
      resultText += `*Note: No conversion needed - source and target systems are the same.*`;
    }

    return createSuccessResult(resultText);
  } catch (error) {
    return createErrorResult(`Failed to convert coordinates: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}; 