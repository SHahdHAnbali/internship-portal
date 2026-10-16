import {
    Injectable,
    Logger,
    InternalServerErrorException,
  } from '@nestjs/common';
  
  import { ConfigService } from '@nestjs/config';
  
  import OpenAI from 'openai';
  
  import type { ApplicationMatch } from '../../domain/types/application-match.js';
  import type { ExtractedCvData } from '../../domain/types/extracted-cv-data.js';
  
  interface InternshipRequirementsForMatching {
    requiredSkills: string[];
    preferredSkills: string[];
    minimumEducation: string | null;
    minimumExperienceYears: number | null;
    languages: string[];
    certifications: string[];
    otherRequirements: string | null;
  }
  
  @Injectable()
  export class AiApplicationMatcherService {
    private readonly logger = new Logger(AiApplicationMatcherService.name);
    private readonly client: OpenAI;
  
    constructor(
      private readonly configService: ConfigService,
    ) {
      const apiKey =
        this.configService.get<string>(
          'ai.openRouterApiKey',
        );
  
      if (!apiKey) {
        throw new InternalServerErrorException(
          'OpenRouter API key is missing',
        );
      }
  
      this.client = new OpenAI({
        apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
      });
    }
  
    async match(
      requirements: InternshipRequirementsForMatching,
      candidate: ExtractedCvData,
    ): Promise<ApplicationMatch> {
      try {
        const response =
          await this.client.chat.completions.create({
            model: 'openrouter/free',
  
            messages: [
              {
                role: 'system',
                content: `
  You are a candidate-to-internship matching engine.
  
  Your job is to compare internship requirements against structured candidate CV data.
  
  Rules:
  - Use only the provided data.
  - Do not invent candidate skills or qualifications.
  - Do not assume a skill based only on a job title.
  - Required skills are more important than preferred skills.
  - Missing required skills must reduce the skills score.
  - Minimum education must affect education score.
  - Minimum experience must affect experience score.
  - Required languages must affect languages score.
  - Preferred skills may increase the score but must not outweigh missing required skills.
  - Scores must be integers from 0 to 100.
  - overallScore must reflect the complete match.
  - Return valid JSON only.
  - Do not return markdown or explanation outside JSON.
                `.trim(),
              },
  
              {
                role: 'user',
                content: `
  Compare this candidate with the internship requirements.
  
  INTERNSHIP REQUIREMENTS:
  
  ${JSON.stringify(requirements, null, 2)}
  
  CANDIDATE DATA:
  
  ${JSON.stringify(candidate, null, 2)}
  
  Return ONLY JSON using exactly this structure:
  
  {
    "overallScore": 0,
    "skillsScore": 0,
    "educationScore": 0,
    "experienceScore": 0,
    "languagesScore": 0,
    "matchedRequirements": [],
    "missingRequirements": [],
    "strengths": [],
    "gaps": []
  }
  
  Instructions:
  - matchedRequirements should list requirements clearly satisfied by the candidate.
  - missingRequirements should list requirements not found or not satisfied.
  - strengths should summarize strong points relevant to this internship.
  - gaps should summarize weaknesses or missing qualifications.
  - Do not add extra fields.
                `.trim(),
              },
            ],
  
            response_format: {
              type: 'json_object',
            },
          });
  
        const content =
          response.choices[0]?.message?.content;
  
        if (!content) {
          throw new InternalServerErrorException(
            'AI did not return matching data',
          );
        }
  
        let parsed: Partial<ApplicationMatch>;
  
        try {
          parsed =
            JSON.parse(
              content,
            ) as Partial<ApplicationMatch>;
        } catch {
          throw new InternalServerErrorException(
            'AI returned invalid matching JSON',
          );
        }
  
        return this.normalize(parsed);
      } catch (error) {
        // Log only the error type; provider errors may echo CV data.
        this.logger.error(
          `Application matching failed (${error instanceof Error ? error.name : 'unknown error'})`,
        );
  
        if (
          error instanceof
          InternalServerErrorException
        ) {
          throw error;
        }
  
        throw new InternalServerErrorException(
          'Application matching is temporarily unavailable.',
        );
      }
    }
  
    private normalize(
      data: Partial<ApplicationMatch>,
    ): ApplicationMatch {
      return {
        overallScore:
          this.normalizeScore(
            data.overallScore,
          ),
  
        skillsScore:
          this.normalizeScore(
            data.skillsScore,
          ),
  
        educationScore:
          this.normalizeScore(
            data.educationScore,
          ),
  
        experienceScore:
          this.normalizeScore(
            data.experienceScore,
          ),
  
        languagesScore:
          this.normalizeScore(
            data.languagesScore,
          ),
  
        matchedRequirements:
          Array.isArray(
            data.matchedRequirements,
          )
            ? data.matchedRequirements
            : [],
  
        missingRequirements:
          Array.isArray(
            data.missingRequirements,
          )
            ? data.missingRequirements
            : [],
  
        strengths:
          Array.isArray(data.strengths)
            ? data.strengths
            : [],
  
        gaps:
          Array.isArray(data.gaps)
            ? data.gaps
            : [],
      };
    }
  
    private normalizeScore(
      value: unknown,
    ): number {
      const score = Number(value);
  
      if (
        Number.isNaN(score)
      ) {
        return 0;
      }
  
      return Math.max(
        0,
        Math.min(
          100,
          Math.round(score),
        ),
      );
    }
  }