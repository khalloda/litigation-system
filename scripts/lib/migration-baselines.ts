export type ReviewAnswerBaseline = Readonly<{
  valueAnswers: number;
  findingAnswers: number;
  totalAnswers: number;
  mappingDigest: string;
  answerDigest: string;
}>;

export type AttendeeSourceBaseline = Readonly<{ cells: number; digest: string }>;

export type AttendeeAuditBaseline = Readonly<{
  cells: number;
  spans: number;
  personSpans: number;
  ambiguousSpans: number;
  quarantineRows: number;
  distinctPeople: number;
  digest: string;
}>;

export const REVIEW_ANSWER_BASELINE: ReviewAnswerBaseline = Object.freeze({
  valueAnswers: 668,
  findingAnswers: 76,
  totalAnswers: 744,
  mappingDigest: 'bebf8f20140a63d272f80d454d8363d68e1dc7bf12d82b43a45096281b059f51',
  answerDigest: 'cd19213bcad7ad24912c6067384f25aade84f5a1d479be37f0608755d9f75a35',
});

export const ATTENDEE_SOURCE_BASELINE: AttendeeSourceBaseline = Object.freeze({
  cells: 12_732,
  digest: '3ec09ab48157e51271156e6cea69afe32d17252e4da00c55733d58c44e03cee2',
});

export const ATTENDEE_AUDIT_BASELINE: AttendeeAuditBaseline = Object.freeze({
  cells: 12_732,
  spans: 16_602,
  personSpans: 9_113,
  ambiguousSpans: 10,
  quarantineRows: 10,
  distinctPeople: 39,
  digest: '7e62b9d4f4d1ceb7e3e152095d69b98bce5b7ea0dcc40a055bd368347d5251b4',
});
