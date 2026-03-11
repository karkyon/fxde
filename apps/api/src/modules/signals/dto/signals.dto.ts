import { IsOptional, IsString, IsInt, IsDateString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetSignalsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  symbol?: string;

  @IsOptional()
  @IsString()
  timeframe?: string;

  @IsOptional()
  @IsString()
  signalType?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class GetLatestSignalQueryDto {
  @IsOptional()
  @IsString()
  symbol?: string;

  @IsOptional()
  @IsString()
  timeframe?: string;
}
