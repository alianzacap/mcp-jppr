import { BaseApiClient, type ApiClientConfig } from '@alianzacap/mcp-framework';
import axios, { AxiosResponse } from 'axios';

export interface PropertySearchParams {
  address?: string;
  parcelId?: string;
  municipality?: string;
  latitude?: number;
  longitude?: number;
  bbox?: [number, number, number, number]; // [minX, minY, maxX, maxY]
}

export interface PropertyData {
  parcelId: string;
  address: string;
  municipality: string;
  zone: string;
  landUse: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  area: number;
  owner?: string;
  assessedValue?: number;
  // Additional MIPR-specific fields
  barrio?: string;
  zoning?: string;
  classification?: string;
  floodZone?: string;
  geology?: string;
  permittedUses?: string[];
  coordinates_projected?: {
    x: number;
    y: number;
  };
  // Primary/dominant values (synthetic fields from multi-value data)
  primaryMunicipality?: string;
  primaryBarrio?: string;
  primaryZoning?: string;
  primaryClassification?: string;
  primaryGeology?: string;
  // Multi-value field breakdowns for properties spanning boundaries
  municipalityBreakdown?: Array<{type: string, percentage: number}>;
  barrioBreakdown?: Array<{type: string, percentage: number}>;
  zoningBreakdown?: Array<{type: string, percentage: number}>;
  classificationBreakdown?: Array<{type: string, percentage: number}>;
  geologyBreakdown?: Array<{type: string, percentage: number}>;
}

export interface MiprApiClientConfig {
  baseUrl?: string;
  timeout?: number;
  apiKey?: string;
}

export class MiprApiClient extends BaseApiClient {
  private readonly miprBaseUrl: string;
  private readonly timeout: number;

  constructor(config: MiprApiClientConfig = {}) {
    // MIPR is a public API, so provide a default API key
    super({
      baseUrl: config.baseUrl || 'https://gis.jp.pr.gov',
      apiKey: config.apiKey || 'public-access' // MIPR doesn't require authentication
    });
    this.miprBaseUrl = config.baseUrl || 'https://gis.jp.pr.gov';
    this.timeout = config.timeout || 30000;
  }

  /**
   * Search for properties by various criteria
   */
  async searchProperties(params: PropertySearchParams): Promise<PropertyData[]> {
    try {
      // For parcel ID (Catastro) lookups, use the ESRI REST endpoint
      if (params.parcelId) {
        return await this.getPropertyByParcelId(params.parcelId);
      }

      // For coordinate-based lookups, use the coordinate endpoint
      if (params.latitude && params.longitude) {
        return await this.getPropertyByCoordinates(params.latitude, params.longitude);
      }

      // For other search types (address, municipality), we'd need to discover additional endpoints
      console.warn('Only parcel ID and coordinate searches are currently supported. Address and municipality searches need additional API discovery.');
      return [];
    } catch (error) {
      throw new Error(`Failed to search properties: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get property by Catastro (parcel ID) using real MIPR ESRI API
   */
  private async getPropertyByParcelId(parcelId: string): Promise<PropertyData[]> {
    try {
      // Validate and format Catastro number
      // ESRI API expects format like "274-093-306-20" not "274-093-306-20-000"
      const formattedParcelId = this.formatCatastroNumber(parcelId);
      
      const url = `${this.miprBaseUrl}/2013_RecibidorGeoComentarios/SometerGeoComentario/pnt_to_loc82_2024`;
      
      const response = await axios.get(url, {
        params: {
          ident: 'fromH_mipr2022',
          isr: '4326',  // WGS84 input spatial reference
          osr: '32161', // Puerto Rico State Plane output spatial reference  
          c: formattedParcelId   // Formatted Catastro number
        },
        timeout: this.timeout,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'mcp-jppr/1.0.0'
        }
      });

      return this.parsePropertyResponse(response);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return []; // Property not found
      }
      throw error;
    }
  }

  /**
   * Format Catastro number for ESRI API
   * Strips trailing -ddd from full format (e.g., "274-093-306-20-000" -> "274-093-306-20")
   */
  private formatCatastroNumber(catastro: string): string {
    // Remove any whitespace
    const cleaned = catastro.trim();
    
    // Check if it matches the full format (xxx-xxx-xxx-xx-xxx)
    // If so, remove the last -xxx part
    const fullFormatRegex = /^(\d{3}-\d{3}-\d{3}-\d{2})-\d{3}$/;
    const match = cleaned.match(fullFormatRegex);
    
    if (match) {
      return match[1]; // Return without the trailing -xxx
    }
    
    // If it doesn't match full format, return as-is (assume it's already in correct format)
    return cleaned;
  }

  /**
   * Get property by coordinates (latitude/longitude) using real MIPR ESRI API
   */
  private async getPropertyByCoordinates(latitude: number, longitude: number): Promise<PropertyData[]> {
    try {
      const url = `${this.miprBaseUrl}/2013_RecibidorGeoComentarios/SometerGeoComentario/pnt_to_loc82_2024`;
      
      const response = await axios.get(url, {
        params: {
          ident: 'fromH_mipr2022',
          input_X: longitude.toString(),  // Note: X is longitude, Y is latitude
          input_Y: latitude.toString(),
          isr: '4326',   // WGS84 input spatial reference
          osr: '32161',  // Puerto Rico State Plane output spatial reference
          method: ''     // Empty but required parameter
        },
        timeout: this.timeout,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'mcp-jppr/1.0.0'
        }
      });

      return this.parsePropertyResponse(response);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return []; // Property not found at coordinates
      }
      throw error;
    }
  }

  /**
   * Get property details by parcel ID
   */
  async getPropertyDetails(parcelId: string): Promise<PropertyData | null> {
    try {
      const properties = await this.searchProperties({ parcelId });
      return properties.length > 0 ? properties[0] : null;
    } catch (error) {
      throw new Error(`Failed to get property details: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get properties within a bounding box
   */
  async getPropertiesInBounds(bbox: [number, number, number, number]): Promise<PropertyData[]> {
    try {
      return await this.searchProperties({ bbox });
    } catch (error) {
      throw new Error(`Failed to get properties in bounds: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get available municipalities
   */
  async getMunicipalities(): Promise<string[]> {
    try {
      // Placeholder - would query MIPR for available municipalities
      return [
        'San Juan', 'Bayamón', 'Carolina', 'Ponce', 'Caguas', 'Guaynabo',
        'Mayagüez', 'Trujillo Alto', 'Arecibo', 'Toa Baja', 'Aguadilla',
        'Humacao', 'Vega Alta', 'Manatí', 'Yauco', 'Cayey', 'Cidra',
        'Fajardo', 'Camuy', 'Corozal', 'Aibonito', 'Hatillo', 'Guayama',
        'Isabela', 'Toa Alta', 'Canóvanas', 'Gurabo', 'Juncos', 'Lajas',
        'Cataño', 'Villalba', 'Yabucoa', 'Santa Isabel', 'Salinas',
        'Cabo Rojo', 'Hormigueros', 'Aguada', 'Rincón', 'Añasco',
        'Sabana Grande', 'San Germán', 'Las Marías', 'Maricao', 'Lares',
        'Utuado', 'Adjuntas', 'Peñuelas', 'Guánica', 'Ponce', 'Juana Díaz',
        'Villalba', 'Orocovis', 'Barranquitas', 'Comerio', 'Aguas Buenas',
        'San Lorenzo', 'Las Piedras', 'Naguabo', 'Ceiba', 'Culebra', 'Vieques',
        'Loíza', 'Río Grande', 'Luquillo', 'Canóvanas', 'Gurabo', 'Juncos',
        'Humacao', 'Yabucoa', 'Maunabo', 'Patillas', 'Arroyo', 'Guayama',
        'Salinas', 'Santa Isabel', 'Coamo', 'Aibonito', 'Cayey', 'Cidra'
      ].sort();
    } catch (error) {
      throw new Error(`Failed to get municipalities: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse the response from MIPR API into our standard format
   */
  private parsePropertyResponse(response: AxiosResponse): PropertyData[] {
    try {
      const data = response.data;
      
      // Check if the response has the expected structure
      if (!data.dato || !data.dato.atributos) {
        return [];
      }

      // Check for "nodata" response indicating property not found
      if (data.dato.atributos === "nodata") {
        return [];
      }

      const attrs = data.dato.atributos;
      
      // Additional validation: check if we have meaningful property data
      if (!attrs.Catastro && !attrs.Municipio && (!attrs.Lat || attrs.Lat === "0")) {
        return []; // Empty or invalid property data
      }
      
      // Extract property data from MIPR response
      const property: PropertyData = {
        parcelId: attrs.Catastro || '',
        address: this.buildAddress(attrs),
        municipality: this.getPreferredOrMulti(attrs.Municipio, attrs.Muni_Multi),
        zone: this.buildZoneInfo(attrs),
        landUse: attrs.Usos || attrs.Clasificacion || '',
        coordinates: {
          latitude: parseFloat(attrs.Lat) || 0,
          longitude: parseFloat(attrs.Lon) || 0
        },
        area: parseFloat(attrs.Area_Geom) || 0,
        // Additional MIPR-specific data
        barrio: this.getPreferredOrMulti(attrs.Barrio, attrs.Barrio_Multi),
        zoning: attrs.Calificacion || '',
        classification: attrs.Clasificacion || '',
        floodZone: attrs.Inun_Zona || '',
        geology: attrs.Suelo_Geolo || '',
        permittedUses: this.extractPermittedUses(attrs.UsosRC2020),
        coordinates_projected: {
          x: parseFloat(attrs.Coord_X) || 0,
          y: parseFloat(attrs.Coord_Y) || 0
        },
        // Multi-value field details for properties spanning boundaries
        municipalityBreakdown: this.parseMultiValue(attrs.Muni_Multi),
        barrioBreakdown: this.parseMultiValue(attrs.Barrio_Multi),
        zoningBreakdown: this.parseMultiValue(attrs.Calificacion),
        classificationBreakdown: this.parseMultiValue(attrs.Clasificacion),
        geologyBreakdown: this.parseMultiValue(attrs.Suelo_Geolo),
        // Primary/dominant values (synthetic fields)
        primaryMunicipality: this.getPrimaryValue(attrs.Muni_Multi) || attrs.Municipio || '',
        primaryBarrio: this.getPrimaryValue(attrs.Barrio_Multi) || attrs.Barrio || '',
        primaryZoning: this.getPrimaryValue(attrs.Calificacion) || '',
        primaryClassification: this.getPrimaryValue(attrs.Clasificacion) || '',
        primaryGeology: this.getPrimaryValue(attrs.Suelo_Geolo) || ''
      };

      return [property];
    } catch (error) {
      console.error('Error parsing MIPR response:', error);
      return [];
    }
  }

  /**
   * Build a readable address from MIPR attributes
   */
  private buildAddress(attrs: any): string {
    const parts = [];
    if (attrs.Barrio || attrs.Barrio_Multi) {
      parts.push(`Barrio ${attrs.Barrio || attrs.Barrio_Multi}`);
    }
    if (attrs.Municipio || attrs.Muni_Multi) {
      parts.push(attrs.Municipio || attrs.Muni_Multi);
    }
    parts.push('Puerto Rico');
    return parts.join(', ');
  }

  /**
   * Build zone information combining various zoning fields
   */
  private buildZoneInfo(attrs: any): string {
    const parts = [];
    if (attrs.Calificacion) parts.push(`Zoning: ${attrs.Calificacion}`);
    if (attrs.Clasificacion) parts.push(`Classification: ${attrs.Clasificacion}`);
    if (attrs.Inun_Zona) parts.push(`Flood Zone: ${attrs.Inun_Zona}`);
    return parts.join(' | ');
  }

  /**
   * Extract permitted uses from the zoning data
   */
  private extractPermittedUses(usosRC2020: any): string[] {
    if (!usosRC2020 || typeof usosRC2020 !== 'object') {
      return [];
    }
    
    const allUses: string[] = [];
    Object.values(usosRC2020).forEach((uses: any) => {
      if (Array.isArray(uses)) {
        allUses.push(...uses);
      }
    });
    
    return allUses;
  }

  /**
   * Get preferred single value or multi-value string
   */
  private getPreferredOrMulti(single?: string, multi?: string): string {
    // If we only have single value, use it
    if (single && !multi) return single;
    
    // If we have multi-value, prefer it (more detailed)
    if (multi) return multi;
    
    // Fallback to single or empty
    return single || '';
  }

  /**
   * Parse multi-value fields with percentages into structured data
   * Example: "R-I (97%), R-3 (2%), R-1 (1%)" -> [{type: "R-I", percentage: 97}, ...]
   */
  private parseMultiValue(value?: string): Array<{type: string, percentage: number}> {
    if (!value) return [];
    
    try {
      // Match pattern: "Type (xx%)" or "Type (xx.x%)"
      // Handle cases with commas or other separators
      const regex = /([^(,]+?)\s*\((\d+(?:\.\d+)?)\%\)/g;
      const results: Array<{type: string, percentage: number}> = [];
      let match;
      
      while ((match = regex.exec(value)) !== null) {
        const type = match[1].trim();
        const percentage = parseFloat(match[2]);
        results.push({ type, percentage });
      }
      
      return results;
         } catch (error) {
       console.warn('Error parsing multi-value field:', value, error);
       return [];
     }
   }

   /**
    * Get the primary (highest percentage) value from a multi-value field
    */
   private getPrimaryValue(value?: string): string | undefined {
     if (!value) return undefined;
     
     const breakdown = this.parseMultiValue(value);
     if (breakdown.length === 0) return undefined;
     
     // Find the item with the highest percentage
     const primary = breakdown.reduce((prev, current) => 
       (current.percentage > prev.percentage) ? current : prev
     );
     
     return primary.type;
   }

  /**
   * Convert coordinates between different systems (if needed)
   */
  async convertCoordinates(
    latitude: number, 
    longitude: number, 
    fromSystem: string = 'WGS84', 
    toSystem: string = 'WGS84'
  ): Promise<{ latitude: number; longitude: number }> {
    // Placeholder for coordinate system conversion
    // Puerto Rico often uses State Plane Coordinate System
    return { latitude, longitude };
  }
} 