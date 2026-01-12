"""
Unit tests for WizardStateRepository.
"""

from file_brain.database.repositories.wizard_state_repository import WizardStateRepository


def test_get_or_create_initial(db_session):
    """Creates initial state on first call."""
    repo = WizardStateRepository(db_session)
    state = repo.get_or_create()

    assert state is not None
    assert state.wizard_completed is False
    assert state.last_step_completed == 0


def test_get_or_create_existing(db_session):
    """Returns existing state."""
    repo = WizardStateRepository(db_session)
    first = repo.get_or_create()
    second = repo.get_or_create()

    assert first.id == second.id


def test_update_step_progress(db_session):
    """Updates last completed step."""
    repo = WizardStateRepository(db_session)
    repo.get_or_create()

    updated = repo.update_last_step(2)
    assert updated.last_step_completed == 2


def test_mark_completed(db_session):
    """Sets wizard_completed flag."""
    repo = WizardStateRepository(db_session)
    repo.get_or_create()

    completed = repo.mark_completed()
    assert completed.wizard_completed is True


def test_reset_state(db_session):
    """Resets all fields to initial values."""
    repo = WizardStateRepository(db_session)
    repo.get_or_create()
    repo.update_last_step(3)
    repo.mark_completed()

    reset = repo.reset()
    assert reset.wizard_completed is False
    assert reset.last_step_completed == 0
