"""A simple coin-account subsystem.

Accounts are identified by 4-digit string ids. Coins can be transferred
between accounts, but only the owner of the source account may authorize a
transfer out of it.
"""

from dataclasses import dataclass

class AccountNotFound(Exception):
    """Raised when an account id does not exist."""


class InsufficientFunds(Exception):
    """Raised when the source account does not have enough coins."""


class NotOwner(Exception):
    """Raised when someone tries to transfer coins out of an account they do not own."""

@dataclass
class Account:
    """Data structure for accounts"""
    def __init__(self, account_id, owner, balance=0):
        self.account_id = account_id
        self.owner = owner
        self.balance = balance

    def __repr__(self):
        return f"Account({self.account_id!r}, owner={self.owner!r}, balance={self.balance})"


class Bank:
    """Bank simulator"""
    def __init__(self):
        self.accounts = {}

    def create_account(self, account_id, owner, balance=0):
        """Create simulated account"""
        if not (isinstance(account_id, str) and len(account_id) == 4 and account_id.isdigit()):
            raise ValueError("account id must be a 4-digit string")
        if account_id in self.accounts:
            raise ValueError(f"account {account_id} already exists")
        self.accounts[account_id] = Account(account_id, owner, balance)

    def get_balance(self, account_id):
        """Get balance of simulated account"""
        account = self.accounts.get(account_id)
        if account is None:
            raise AccountNotFound(f"account {account_id} does not exist")
        return account.balance

    def list_accounts(self):
        """Return a summary of every account in the bank."""
        return [
            {
                "account_id": account.account_id,
                "owner": account.owner,
                "balance": account.balance,
            }
            for account in self.accounts.values()
        ]

    def transfer(self, from_id, to_id, amount, owner):
        """Transfer coins from from_id to to_id.

        `owner` must be the owner of the source account, otherwise NotOwner is
        raised. This is the ownership rule: only an account owner can transfer
        coins out of their own account.
        """
        if from_id not in self.accounts:
            raise AccountNotFound(f"account {from_id} does not exist")
        if to_id not in self.accounts:
            raise AccountNotFound(f"account {to_id} does not exist")
        if from_id == to_id:
            raise ValueError("cannot transfer coins to the same account")

        source = self.accounts[from_id]
        if source.owner != owner:
            raise NotOwner(f"only the owner of account {from_id} can transfer coins from it")

        if not isinstance(amount, int) or amount <= 0:
            raise ValueError("transfer amount must be a positive whole number")
        if source.balance < amount:
            raise InsufficientFunds(f"account {from_id} has insufficient coins")

        source.balance -= amount
        self.accounts[to_id].balance += amount
