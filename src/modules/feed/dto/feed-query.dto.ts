import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class FeedQueryDto {
  @ApiPropertyOptional({
    description: 'Curseur de pagination : id du dernier post reçu.',
  })
  @IsString()
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({ example: 20, default: 20, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number;
}
