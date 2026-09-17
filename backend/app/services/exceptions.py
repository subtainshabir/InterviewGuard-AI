class ServiceError(Exception):
    pass


class CandidateNotFoundError(ServiceError):
    pass


class InterviewSessionNotFoundError(ServiceError):
    pass


class InvalidStateTransitionError(ServiceError):
    pass